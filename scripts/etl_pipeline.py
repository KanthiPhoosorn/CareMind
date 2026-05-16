#!/usr/bin/env python3
"""
ETL Pipeline: HIS Export → Normalized JSON with Chunking

Converts raw hospital export files (Excel) to normalized JSON chunks
with metadata (timestamp, author role, note type).

Features:
- Reads multiple Excel files (doctor notes, nurse notes, labs, imaging, meds)
- Normalizes data structure
- De-identifies sensitive info
- Chunks by encounter, section, and note type
- Adds metadata (author role, timestamp, note type)
- Outputs to structured JSON

Usage:
    python etl_pipeline.py --input-dir data/ --output-dir output/
"""

import os
import sys
import json
import argparse
from pathlib import Path
from typing import Dict, List, Any, Optional, Tuple
from datetime import datetime
from dataclasses import dataclass, asdict
import re

try:
    import pandas as pd
except ImportError:
    print("Error: pandas not installed. Run: pip install pandas")
    sys.exit(1)

# Add scripts directory to path for imports
sys.path.insert(0, os.path.dirname(__file__))
from deidentify import DeidentificationPipeline


@dataclass
class DocumentChunk:
    """Represents a single chunk of clinical data with metadata."""
    
    chunk_id: str  # Unique ID for this chunk
    encounter_id: str  # Patient encounter (AN/HN)
    patient_id: str  # De-identified patient ID
    chunk_type: str  # 'doctor_note', 'nurse_note', 'lab', 'imaging', 'medication'
    section: str  # Section within note (e.g., 'assessment', 'plan', 'findings')
    content: str  # The actual text content
    timestamp: str  # ISO 8601 timestamp
    author_role: str  # 'doctor', 'nurse', 'pharmacist', 'radiologist', 'lab_tech'
    author_id: str  # De-identified author ID
    document_title: str  # Original document title/type
    metadata: Dict[str, Any]  # Additional metadata (vitals, lab values, etc.)


class ExcelDataExtractor:
    """Extracts data from Excel files (HIS export format)."""
    
    @staticmethod
    def read_excel_safe(file_path: str) -> Optional[pd.DataFrame]:
        """Safely read Excel file with multiple try strategies."""
        try:
            # Try default read
            df = pd.read_excel(file_path, sheet_name=0)
            return df
        except Exception as e:
            print(f"Warning: Could not read {file_path}: {e}")
            return None
    
    @staticmethod
    def flatten_dataframe(df: pd.DataFrame, max_cols: int = 10) -> List[Dict[str, Any]]:
        """Convert DataFrame to list of dicts, handling sparse data."""
        records = []
        for _, row in df.iterrows():
            # Filter out NaN values and convert to dict
            record = {k: v for k, v in row.items() if pd.notna(v)}
            if record:  # Only add non-empty records
                records.append(record)
        return records


class ChunkingStrategy:
    """Strategies for chunking documents into clinical units."""
    
    @staticmethod
    def chunk_by_section(content: str, note_type: str) -> Dict[str, str]:
        """
        Split clinical note into sections.
        
        Common sections in Thai clinical notes:
        - Assessment (ประเมิน)
        - Diagnosis (วินิจฉัย)
        - Plan (แผนการรักษา)
        - Vital signs
        - Physical exam (O/E)
        - Lab findings
        """
        sections = {}
        
        # Define section markers (English + Thai)
        section_patterns = {
            'chief_complaint': r'(chief complaint|cc|presenting complaint|ปัญหาหลัก|อาการหลัก)',
            'assessment': r'(assessment|a\.|ประเมิน|การประเมิน)',
            'diagnosis': r'(diagnosis|d\.|impression|วินิจฉัย|การวินิจฉัย)',
            'plan': r'(plan|p\.|management|แผน|แผนการรักษา|plan of action)',
            'vital_signs': r'(vital signs|vitals|v/s|temp|temperature|bp|heart rate|hr|o2 sat)',
            'physical_exam': r'(physical exam|o/e|on examination|examination|ตรวจ)',
            'lab': r'(lab|laboratory|result|finding|labs)',
            'medication': r'(medication|drug|medicine|ยา|prescription)',
            'imaging': r'(x-ray|xray|ct|mri|ultrasound|imaging|image)',
            'notes': r'(note|notes|comment|impression)',
        }
        
        # Split by section headers
        current_section = 'content'
        current_text = []
        
        for line in content.split('\n'):
            line_lower = line.lower()
            matched_section = False
            
            for section_name, pattern in section_patterns.items():
                if re.search(pattern, line_lower):
                    # Save previous section
                    if current_text:
                        sections[current_section] = '\n'.join(current_text).strip()
                    
                    # Start new section
                    current_section = section_name
                    current_text = [line]
                    matched_section = True
                    break
            
            if not matched_section and current_text or line.strip():
                current_text.append(line)
        
        # Save last section
        if current_text:
            sections[current_section] = '\n'.join(current_text).strip()
        
        return sections
    
    @staticmethod
    def chunk_by_encounter(records: List[Dict[str, Any]]) -> Dict[str, List[Dict[str, Any]]]:
        """Group records by encounter (patient visit)."""
        encounters = {}
        
        for record in records:
            # Extract encounter ID (AN, HN, or first occurrence of numeric ID)
            encounter_id = None
            for key in ['patientId', 'patient_id', 'an', 'hn', 'encounter_id']:
                if key in record:
                    encounter_id = record[key]
                    break
            
            if not encounter_id:
                # Generate from timestamp
                timestamp = record.get('timestamp', str(datetime.now().date()))
                encounter_id = f"{record.get('patientId', 'unknown')}_{timestamp}"
            
            if encounter_id not in encounters:
                encounters[encounter_id] = []
            
            encounters[encounter_id].append(record)
        
        return encounters


class ETLPipeline:
    """Main ETL pipeline: HIS → Normalized JSON chunks."""
    
    def __init__(self, deidentify: bool = True):
        """
        Initialize ETL pipeline.
        
        Args:
            deidentify: Whether to de-identify PII
        """
        self.deidentify = deidentify
        self.deidentifier = DeidentificationPipeline() if deidentify else None
        self.chunks: List[DocumentChunk] = []
        self.chunk_id_counter = 0
    
    def process_directory(self, input_dir: str, output_dir: str) -> int:
        """
        Process all Excel files in directory.
        
        Args:
            input_dir: Input directory with Excel files
            output_dir: Output directory for JSON chunks
        
        Returns:
            Total number of chunks created
        """
        os.makedirs(output_dir, exist_ok=True)
        
        input_path = Path(input_dir)
        excel_files = list(input_path.glob('**/AN*/*.xlsx'))
        
        print(f"Found {len(excel_files)} Excel files in {input_dir}")
        
        # Group files by encounter
        encounters = self._organize_files(excel_files)
        
        # Process each encounter
        total_chunks = 0
        for encounter_id, file_group in encounters.items():
            chunks = self._process_encounter(encounter_id, file_group)
            total_chunks += len(chunks)
        
        # Write all chunks to output
        output_file = os.path.join(output_dir, 'all_chunks.jsonl')
        self._write_chunks(output_file)
        
        # Also write metadata index
        index_file = os.path.join(output_dir, 'chunk_index.json')
        self._write_index(index_file)
        
        print(f"✓ Created {total_chunks} chunks")
        print(f"✓ Output: {output_file}")
        print(f"✓ Index: {index_file}")
        
        return total_chunks
    
    def _organize_files(self, excel_files: List[Path]) -> Dict[str, List[Path]]:
        """Organize Excel files by encounter (AN folder)."""
        encounters = {}
        
        for file_path in excel_files:
            # Extract encounter ID from path (AN1, AN2, etc.)
            encounter_id = file_path.parent.name
            
            if encounter_id not in encounters:
                encounters[encounter_id] = []
            
            encounters[encounter_id].append(file_path)
        
        return encounters
    
    def _process_encounter(self, encounter_id: str, files: List[Path]) -> List[DocumentChunk]:
        """Process all files for a single encounter."""
        encounter_chunks = []
        
        for file_path in files:
            # Determine file type from filename
            file_name = file_path.name.lower()
            
            if 'doctor' in file_name or 'progress' in file_name:
                file_type = 'doctor_note'
                author_role = 'doctor'
            elif 'nurse' in file_name:
                file_type = 'nurse_note'
                author_role = 'nurse'
            elif 'lab' in file_name:
                file_type = 'lab'
                author_role = 'lab_tech'
            elif 'xray' in file_name or 'imaging' in file_name:
                file_type = 'imaging'
                author_role = 'radiologist'
            elif 'drug' in file_name or 'medication' in file_name:
                file_type = 'medication'
                author_role = 'pharmacist'
            else:
                file_type = 'other'
                author_role = 'staff'
            
            # Read Excel file
            df = ExcelDataExtractor.read_excel_safe(str(file_path))
            if df is None:
                continue
            
            # Convert to records
            records = ExcelDataExtractor.flatten_dataframe(df)
            
            # Create chunks from records
            for i, record in enumerate(records):
                chunks = self._create_chunks_from_record(
                    encounter_id, record, file_type, author_role, file_path.name
                )
                encounter_chunks.extend(chunks)
        
        self.chunks.extend(encounter_chunks)
        return encounter_chunks
    
    def _create_chunks_from_record(
        self,
        encounter_id: str,
        record: Dict[str, Any],
        file_type: str,
        author_role: str,
        document_title: str
    ) -> List[DocumentChunk]:
        """Create chunks from a single record."""
        chunks = []
        
        # Extract key fields
        timestamp = self._extract_timestamp(record)
        author_id = record.get('doctorId', record.get('nurseId', f'staff_{self.chunk_id_counter}'))
        
        # De-identify if needed
        if self.deidentify:
            record = self.deidentifier.deidentify_json(record)
            author_id = self._mask_id(author_id)
        
        # Generate patient ID (de-identified)
        patient_id = f"patient_{hash(encounter_id) % 10000:04d}"
        
        # Extract content based on file type
        if file_type == 'doctor_note':
            content_fields = ['assessment', 'plan', 'diagnosis', 'chiefComplaint', 'notes']
        elif file_type == 'nurse_note':
            content_fields = ['notes', 'assessment', 'vitalSigns', 'taskType']
        elif file_type == 'lab':
            content_fields = ['results', 'interpretation', 'testName']
        elif file_type == 'imaging':
            content_fields = ['findings', 'interpretation', 'impression', 'technique']
        elif file_type == 'medication':
            content_fields = ['indication', 'instructions', 'notes']
        else:
            content_fields = list(record.keys())
        
        # Create chunk for each significant field
        for field in content_fields:
            if field in record and record[field]:
                content = str(record[field])
                
                if not content.strip():
                    continue
                
                # Split into sections
                sections = ChunkingStrategy.chunk_by_section(content, file_type)
                
                # Create a chunk for each section
                for section_name, section_content in sections.items():
                    if section_content.strip():
                        chunk = DocumentChunk(
                            chunk_id=f"chunk_{self.chunk_id_counter:06d}",
                            encounter_id=encounter_id,
                            patient_id=patient_id,
                            chunk_type=file_type,
                            section=section_name,
                            content=section_content,
                            timestamp=timestamp,
                            author_role=author_role,
                            author_id=author_id,
                            document_title=document_title,
                            metadata=self._extract_metadata(record, file_type)
                        )
                        chunks.append(chunk)
                        self.chunk_id_counter += 1
        
        return chunks
    
    def _extract_timestamp(self, record: Dict[str, Any]) -> str:
        """Extract and normalize timestamp from record."""
        for key in ['timestamp', 'date', 'datetime', 'created_at', 'updated_at']:
            if key in record:
                value = record[key]
                # Try to parse and normalize
                if isinstance(value, str):
                    # Already a string, assume ISO format
                    return value
                else:
                    # Try to convert to ISO format
                    try:
                        return str(value)
                    except:
                        pass
        
        # Default to current timestamp
        return datetime.now().isoformat()
    
    def _mask_id(self, id_str: str) -> str:
        """Create masked ID version."""
        if not id_str:
            return 'unknown'
        return f"staff_{hash(id_str) % 10000:04d}"
    
    def _extract_metadata(self, record: Dict[str, Any], file_type: str) -> Dict[str, Any]:
        """Extract relevant metadata from record."""
        metadata = {}
        
        # Vital signs
        for key in ['temperature', 'heartRate', 'bloodPressure', 'oxygenSaturation', 'respiratoryRate']:
            if key in record:
                metadata[key] = record[key]
        
        # Lab values
        for key in ['value', 'unit', 'range', 'flag']:
            if key in record:
                metadata[key] = record[key]
        
        # Medication details
        for key in ['dosage', 'route', 'frequency', 'duration', 'status']:
            if key in record:
                metadata[key] = record[key]
        
        # Generic metadata
        for key in ['specialty', 'shift', 'status']:
            if key in record:
                metadata[key] = record[key]
        
        return metadata
    
    def _write_chunks(self, output_file: str):
        """Write chunks to JSONL format (one JSON object per line)."""
        with open(output_file, 'w', encoding='utf-8') as f:
            for chunk in self.chunks:
                json.dump(asdict(chunk), f, ensure_ascii=False)
                f.write('\n')
    
    def _write_index(self, output_file: str):
        """Write index of chunks grouped by type and encounter."""
        index = {
            'total_chunks': len(self.chunks),
            'by_type': {},
            'by_encounter': {},
            'chunks': []
        }
        
        for chunk in self.chunks:
            # Add to type index
            if chunk.chunk_type not in index['by_type']:
                index['by_type'][chunk.chunk_type] = 0
            index['by_type'][chunk.chunk_type] += 1
            
            # Add to encounter index
            if chunk.encounter_id not in index['by_encounter']:
                index['by_encounter'][chunk.encounter_id] = []
            index['by_encounter'][chunk.encounter_id].append(chunk.chunk_id)
            
            # Add chunk metadata
            index['chunks'].append({
                'chunk_id': chunk.chunk_id,
                'encounter_id': chunk.encounter_id,
                'chunk_type': chunk.chunk_type,
                'section': chunk.section,
                'timestamp': chunk.timestamp,
                'author_role': chunk.author_role,
                'word_count': len(chunk.content.split())
            })
        
        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump(index, f, indent=2, ensure_ascii=False)


def main():
    parser = argparse.ArgumentParser(
        description='ETL Pipeline: HIS Export → Normalized JSON Chunks'
    )
    parser.add_argument(
        '--input-dir', type=str, default='data/',
        help='Input directory with HIS Excel files'
    )
    parser.add_argument(
        '--output-dir', type=str, default='output/',
        help='Output directory for normalized JSON chunks'
    )
    parser.add_argument(
        '--no-deidentify', action='store_true',
        help='Do not de-identify PII'
    )
    
    args = parser.parse_args()
    
    # Run pipeline
    pipeline = ETLPipeline(deidentify=not args.no_deidentify)
    total_chunks = pipeline.process_directory(args.input_dir, args.output_dir)
    
    print(f"\n✓ ETL pipeline complete: {total_chunks} chunks created")


if __name__ == '__main__':
    main()

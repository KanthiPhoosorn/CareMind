import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, StyleSheet, SafeAreaView, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Users, ClipboardList, Bell, User, ChevronRight, ArrowLeft } from 'lucide-react-native';
import { ROLE_COLOR, ROLE_BG, WEB_PATIENTS, SEV_BG, SEV_FG } from '../utils/mock-data';

export default function NurseScreen({ navigation }: any) {
  const c = ROLE_COLOR.nurse;
  const bg = ROLE_BG.nurse;
  const softBg = '#F0FDF8';
  const [screen, setScreen] = useState('list');
  const [pt, setPt] = useState<any>(null);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: softBg }}>
      {/* Warm header */}
      <LinearGradient colors={['#D1FAE5', softBg]} style={styles.header}>
        <View style={styles.headerContent}>
          <View>
            <Text style={styles.headerSub}>{screen === 'list' ? 'Day shift · Cardio 4B' : 'Patient'}</Text>
            <Text style={styles.headerTitle}>{screen === 'list' ? 'Hi Rita 👋' : (pt?.name || '')}</Text>
          </View>
          <View style={[styles.avatar, { backgroundColor: c }]}>
            <Text style={styles.avatarText}>RT</Text>
          </View>
        </View>
      </LinearGradient>

      {screen === 'list' && (
        <ScrollView style={styles.scrollContent} contentContainerStyle={{ paddingBottom: 96 }}>
          {/* Friendly status strip */}
          <View style={styles.statusCard}>
            <View style={[styles.statusIcon, { backgroundColor: bg }]}>
              <Text style={{ fontSize: 20 }}>🌿</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.statusTitle}>3 patients on your shift</Text>
              <Text style={styles.statusSub}>2 vitals due soon — you've got this</Text>
            </View>
          </View>

          <View style={styles.filterTabs}>
            <TouchableOpacity style={[styles.filterTab, { backgroundColor: c, borderWidth: 0 }]}>
              <Text style={[styles.filterTabText, { color: '#fff' }]}>All shift</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.filterTab}>
              <Text style={styles.filterTabText}>Vitals due</Text>
            </TouchableOpacity>
          </View>

          {WEB_PATIENTS.slice(0, 3).map((p) => (
            <TouchableOpacity key={p.an} style={styles.patientCard} onPress={() => { setPt(p); setScreen('vitals'); }}>
              <View style={styles.patientCardHeader}>
                <View style={[styles.patientAvatar, { backgroundColor: bg }]}>
                  <Text style={[styles.patientAvatarText, { color: c }]}>
                    {p.name.split(' ').map((s: string) => s[0]).join('').slice(0, 2)}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.patientName}>{p.name}</Text>
                  <Text style={styles.patientDetail}>Bed {p.bed} · {p.dx}</Text>
                </View>
              </View>
              <View style={styles.patientCardFooter}>
                <View style={[styles.sevBadge, { backgroundColor: SEV_BG[p.sev] }]}>
                  <Text style={[styles.sevText, { color: SEV_FG[p.sev] }]}>{p.status}</Text>
                </View>
                <View style={styles.actionLink}>
                  <Text style={[styles.actionText, { color: c }]}>Log vitals</Text>
                  <ChevronRight size={14} color={c} />
                </View>
              </View>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {screen === 'vitals' && (
        <ScrollView style={styles.scrollContent} contentContainerStyle={{ paddingBottom: 96 }}>
          <TouchableOpacity onPress={() => setScreen('list')} style={styles.backButton}>
            <ArrowLeft size={14} color="#64748B" />
            <Text style={styles.backText}>Back</Text>
          </TouchableOpacity>
          
          <View style={styles.vitalsCard}>
            <Text style={styles.vitalsTitle}>New vital signs ✨</Text>
            <Text style={styles.vitalsTime}>Logged at {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
            
            {[['Temp', '°F', '98.6', '🌡️'], ['BP', 'mmHg', '125/80', '🩺'], ['HR', 'bpm', '76', '💓'], ['RR', '/min', '18', '🫁'], ['SpO₂', '%', '97', '💨'], ['Pain', '/10', '2', '🙂']].map(([k, u, v, e]) => (
              <View key={k} style={styles.vitalRow}>
                <Text style={{ fontSize: 16, width: 24 }}>{e}</Text>
                <Text style={styles.vitalLabel}>{k}</Text>
                <TextInput defaultValue={v as string} style={[styles.vitalInput, { backgroundColor: softBg }]} keyboardType="numeric" />
                <Text style={styles.vitalUnit}>{u}</Text>
              </View>
            ))}
            
            <TouchableOpacity style={[styles.saveButton, { backgroundColor: c }]}>
              <Text style={styles.saveButtonText}>Save vitals 💚</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      )}

      {/* Bottom nav */}
      <View style={styles.bottomNav}>
        {[
          { icon: Users, label: 'Patients', active: true },
          { icon: ClipboardList, label: 'Tasks', active: false },
          { icon: Bell, label: 'Alerts', active: false },
          { icon: User, label: 'Me', active: false },
        ].map((item) => {
          const IconComp = item.icon;
          return (
            <TouchableOpacity key={item.label} style={styles.navItem} onPress={() => { if (item.label === 'Me') navigation.goBack() }}>
              <View style={[styles.navIconContainer, { backgroundColor: item.active ? bg : 'transparent' }]}>
                <IconComp size={20} color={item.active ? c : '#64748b'} />
              </View>
              <Text style={[styles.navText, { color: item.active ? c : '#64748b' }]}>{item.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: { padding: 22 },
  headerContent: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerSub: { fontSize: 13, fontWeight: '500', color: '#047857' },
  headerTitle: { fontSize: 24, fontWeight: 'bold', color: '#0F3D2A', marginTop: 6 },
  avatar: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center', borderWidth: 4, borderColor: '#fff' },
  avatarText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  scrollContent: { flex: 1, paddingHorizontal: 16, paddingTop: 4 },
  statusCard: { backgroundColor: '#fff', borderRadius: 20, padding: 16, marginBottom: 12, flexDirection: 'row', alignItems: 'center', gap: 12, shadowColor: '#059669', shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  statusIcon: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  statusTitle: { fontSize: 14, fontWeight: 'bold', color: '#0f172a' },
  statusSub: { fontSize: 11, fontWeight: '500', color: '#64748B', marginTop: 4 },
  filterTabs: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  filterTab: { flex: 1, paddingVertical: 11, borderRadius: 9999, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e5e7eb', alignItems: 'center' },
  filterTabText: { fontSize: 12, fontWeight: '600', color: '#334155' },
  patientCard: { backgroundColor: '#fff', borderRadius: 20, padding: 16, marginBottom: 10, shadowColor: '#0f172a', shadowOpacity: 0.04, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  patientCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  patientAvatar: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  patientAvatarText: { fontSize: 13, fontWeight: '600' },
  patientName: { fontSize: 15, fontWeight: 'bold', color: '#0f172a' },
  patientDetail: { fontSize: 11, fontWeight: '500', color: '#64748B', marginTop: 3 },
  patientCardFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sevBadge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 9999 },
  sevText: { fontSize: 10, fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 0.5 },
  actionLink: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  actionText: { fontSize: 12, fontWeight: '600' },
  backButton: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 16 },
  backText: { fontSize: 13, fontWeight: '500', color: '#64748B' },
  vitalsCard: { backgroundColor: '#fff', borderRadius: 20, padding: 18, shadowColor: '#059669', shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  vitalsTitle: { fontSize: 15, fontWeight: 'bold', color: '#0f172a', marginBottom: 4 },
  vitalsTime: { fontSize: 12, fontWeight: '500', color: '#64748B', marginBottom: 16 },
  vitalRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  vitalLabel: { flex: 1, fontSize: 14, fontWeight: '500', color: '#334155', marginLeft: 8 },
  vitalInput: { width: 88, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, borderWidth: 1, borderColor: '#e5e7eb', textAlign: 'right', fontSize: 15, fontWeight: '600', color: '#0f172a' },
  vitalUnit: { width: 40, fontSize: 11, fontWeight: '500', color: '#64748B', marginLeft: 8 },
  saveButton: { width: '100%', marginTop: 24, paddingVertical: 14, borderRadius: 9999, alignItems: 'center' },
  saveButtonText: { fontSize: 14, fontWeight: '600', color: '#fff' },
  bottomNav: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 80, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#f1f5f9', flexDirection: 'row', paddingBottom: Platform.OS === 'ios' ? 20 : 12, paddingTop: 8 },
  navItem: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4 },
  navIconContainer: { width: 44, height: 32, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
  navText: { fontSize: 10, fontWeight: '600' }
});

BEGIN;
SELECT plan(1);

SELECT has_extension('pgtap', 'pgTAP extension is installed');

SELECT * FROM finish();
ROLLBACK;

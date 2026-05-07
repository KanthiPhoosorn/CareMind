import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { View, Text, TouchableOpacity, StyleSheet, SafeAreaView } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { APP_NAME } from '@caremind/shared';
import NurseScreen from './NurseScreen';
import PatientScreen from './PatientScreen';

const Stack = createNativeStackNavigator();

function RoleSelectionScreen({ navigation }: any) {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F8FAFC' }}>
      <LinearGradient colors={['#EFF4FE', '#F8FAFC']} style={styles.hero}>
        {/* Pulse logo mark */}
        <View style={styles.logoMark}>
          <Text style={{ color: '#fff', fontSize: 22, fontWeight: 'bold', letterSpacing: -1 }}>C</Text>
        </View>
        <Text style={styles.logoText}>{APP_NAME}</Text>
        <Text style={styles.tagline}>AI-powered patient care coordination.</Text>
        <Text style={styles.subTagline}>One patient, one timeline.</Text>
      </LinearGradient>

      <View style={styles.roleContainer}>
        <Text style={styles.rolePrompt}>Sign in as</Text>

        <TouchableOpacity
          style={[styles.roleCard, styles.nurseCard]}
          onPress={() => navigation.navigate('Nurse')}
          activeOpacity={0.85}
        >
          <View style={styles.roleCardInner}>
            <View style={[styles.roleAvatar, { backgroundColor: '#ECFDF5' }]}>
              <Text style={styles.roleEmoji}>💚</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.roleTitle, { color: '#059669' }]}>Nurse</Text>
              <Text style={styles.roleDesc}>Ward list, vitals logger, med pass</Text>
            </View>
            <Text style={[styles.roleArrow, { color: '#059669' }]}>→</Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.roleCard, styles.patientCard]}
          onPress={() => navigation.navigate('Patient')}
          activeOpacity={0.85}
        >
          <View style={styles.roleCardInner}>
            <View style={[styles.roleAvatar, { backgroundColor: '#FEF6E7' }]}>
              <Text style={styles.roleEmoji}>🌅</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.roleTitle, { color: '#D97706' }]}>Patient</Text>
              <Text style={styles.roleDesc}>Health summary and AI assistant</Text>
            </View>
            <Text style={[styles.roleArrow, { color: '#D97706' }]}>→</Text>
          </View>
        </TouchableOpacity>

        <Text style={styles.footerNote}>CareMind © 2026 · Bangkok General Hospital</Text>
      </View>
    </SafeAreaView>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <NavigationContainer>
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          <Stack.Screen name="RoleSelection" component={RoleSelectionScreen} />
          <Stack.Screen name="Nurse" component={NurseScreen} />
          <Stack.Screen name="Patient" component={PatientScreen} />
        </Stack.Navigator>
        <StatusBar style="auto" />
      </NavigationContainer>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  hero: { padding: 40, paddingTop: 56, alignItems: 'center' },
  logoMark: { width: 52, height: 52, borderRadius: 14, backgroundColor: '#2563EB', justifyContent: 'center', alignItems: 'center', marginBottom: 16 },
  logoIcon: { width: 32, height: 20 },
  pulseBar: { height: 2, backgroundColor: '#fff', borderRadius: 2 },
  logoText: { fontSize: 26, fontWeight: 'bold', color: '#0f172a', letterSpacing: -0.5 },
  tagline: { fontSize: 15, fontWeight: '500', color: '#334155', marginTop: 6, textAlign: 'center' },
  subTagline: { fontSize: 12, fontWeight: '500', color: '#64748B', marginTop: 4, textTransform: 'uppercase', letterSpacing: 0.5 },
  roleContainer: { flex: 1, padding: 24, paddingTop: 8 },
  rolePrompt: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.8, color: '#64748B', marginBottom: 14 },
  roleCard: { borderRadius: 18, marginBottom: 12, padding: 18, shadowColor: '#0f172a', shadowOpacity: 0.06, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 3 },
  nurseCard: { backgroundColor: '#fff', borderLeftWidth: 3, borderLeftColor: '#059669' },
  patientCard: { backgroundColor: '#fff', borderLeftWidth: 3, borderLeftColor: '#D97706' },
  roleCardInner: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  roleAvatar: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
  roleEmoji: { fontSize: 22 },
  roleTitle: { fontSize: 17, fontWeight: 'bold', marginBottom: 4 },
  roleDesc: { fontSize: 12, fontWeight: '500', color: '#64748B' },
  roleArrow: { fontSize: 20, fontWeight: 'bold' },
  footerNote: { textAlign: 'center', fontSize: 11, color: '#94a3b8', marginTop: 'auto' as any, paddingBottom: 8 },
});

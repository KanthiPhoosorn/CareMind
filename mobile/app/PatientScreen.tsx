import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  SafeAreaView,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Home, MessageCircle, Pill, User, ArrowUp } from 'lucide-react-native';
import { ROLE_COLOR, ROLE_BG } from '../utils/mock-data';

const c = ROLE_COLOR.patient;
const cBg = ROLE_BG.patient;

interface Message {
  from: 'ai' | 'me';
  text: string;
}

const INITIAL_MSGS: Message[] = [
  { from: 'ai', text: 'Good morning, Mr. Chen 👋 Your blood pressure is looking great today — better than yesterday.' },
  { from: 'me', text: 'Should I take my afternoon dose with food?' },
  { from: 'ai', text: 'Yes — a light lunch around 12:30 will keep your stomach happy. Take it slow today!' },
];

export default function PatientScreen({ navigation }: any) {
  const [tab, setTab] = useState<'home' | 'chat'>('home');
  const [msgs, setMsgs] = useState<Message[]>(INITIAL_MSGS);
  const [draft, setDraft] = useState('');
  const scrollRef = useRef<ScrollView>(null);

  const sendMessage = () => {
    if (!draft.trim()) return;
    setMsgs((prev) => [...prev, { from: 'me', text: draft.trim() }]);
    setDraft('');
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#FFF9F1' }}>
      {/* Warm header */}
      <LinearGradient colors={['#FEEFD3', '#FFF9F1']} style={styles.header}>
        <View style={styles.headerContent}>
          <View>
            <Text style={styles.headerSub}>Good morning ☀️</Text>
            <Text style={styles.headerTitle}>Mr. Chen</Text>
          </View>
          <View style={[styles.avatar, { backgroundColor: c }]}>
            <Text style={styles.avatarText}>MC</Text>
          </View>
        </View>
      </LinearGradient>

      {tab === 'home' && (
        <ScrollView style={styles.scrollContent} contentContainerStyle={{ paddingBottom: 100 }}>
          {/* Reassurance card */}
          <View style={styles.card}>
            <View style={styles.reassuranceHeader}>
              <View style={styles.reassuranceIcon}>
                <Text style={{ fontSize: 18 }}>🌱</Text>
              </View>
              <View>
                <Text style={styles.reassuranceTitle}>You're doing great</Text>
                <Text style={styles.reassuranceSub}>Today's check-in</Text>
              </View>
            </View>
            <Text style={styles.reassuranceBody}>
              Your fever is gone and your heart rate is steady. Keep resting and stay hydrated 💧
            </Text>
            <View style={styles.vitalGrid}>
              {[['Temp', '98.6', '°F', '🌡️'], ['Heart', '76', 'bpm', '💓'], ['BP', '125/80', '', '🩺']].map(([k, v, u, e]) => (
                <View key={k} style={styles.vitalTile}>
                  <Text style={{ fontSize: 16, marginBottom: 4 }}>{e}</Text>
                  <Text style={styles.vitalKey}>{k}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 2 }}>
                    <Text style={styles.vitalValue}>{v}</Text>
                    {!!u && <Text style={styles.vitalUnit}>{u}</Text>}
                  </View>
                </View>
              ))}
            </View>
          </View>

          {/* Next dose */}
          <View style={styles.doseCard}>
            <View style={[styles.doseIcon, { backgroundColor: cBg }]}>
              <Text style={{ fontSize: 24 }}>💊</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.doseTitle}>Next dose at 14:00</Text>
              <Text style={styles.doseSub}>Metoprolol 50 mg · with a light lunch</Text>
            </View>
            <TouchableOpacity style={[styles.remindBtn, { backgroundColor: c }]}>
              <Text style={styles.remindBtnText}>Remind me</Text>
            </TouchableOpacity>
          </View>

          {/* Care team */}
          <Text style={styles.sectionLabel}>Your care team 💛</Text>
          {[
            { emoji: '🩺', name: 'Dr. Michael Chen', role: 'Cardiology', roleKey: 'doctor' },
            { emoji: '💚', name: 'Rita T., RN', role: 'Day shift, ward 4B', roleKey: 'nurse' },
          ].map((member) => (
            <View key={member.name} style={styles.teamCard}>
              <View style={[styles.teamAvatar, { backgroundColor: ROLE_BG[member.roleKey] }]}>
                <Text style={{ fontSize: 20 }}>{member.emoji}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.teamName}>{member.name}</Text>
                <Text style={styles.teamRole}>{member.role}</Text>
              </View>
              <View style={styles.teamAction}>
                <MessageCircle size={16} color="#64748B" />
              </View>
            </View>
          ))}
        </ScrollView>
      )}

      {tab === 'chat' && (
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={80}
        >
          <ScrollView
            ref={scrollRef}
            style={{ flex: 1 }}
            contentContainerStyle={{ padding: 14, paddingBottom: 24 }}
            onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
          >
            {msgs.map((m, i) => (
              <View key={i} style={{ alignItems: m.from === 'me' ? 'flex-end' : 'flex-start', marginBottom: 12 }}>
                {m.from === 'ai' && (
                  <View style={styles.aiLabel}>
                    <Text style={{ fontSize: 11 }}>✨</Text>
                    <Text style={styles.aiLabelText}>CareMind</Text>
                  </View>
                )}
                <View
                  style={[
                    styles.bubble,
                    m.from === 'me'
                      ? { backgroundColor: c, borderBottomRightRadius: 4 }
                      : { backgroundColor: '#fff', borderBottomLeftRadius: 4 },
                  ]}
                >
                  <Text style={[styles.bubbleText, m.from === 'me' ? { color: '#fff' } : { color: '#0f172a' }]}>
                    {m.text}
                  </Text>
                </View>
              </View>
            ))}
          </ScrollView>

          {/* Input bar */}
          <View style={styles.inputBar}>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder="Ask anything about your care…"
              placeholderTextColor="#94a3b8"
              style={styles.chatInput}
              returnKeyType="send"
              onSubmitEditing={sendMessage}
            />
            <TouchableOpacity
              onPress={sendMessage}
              style={[styles.sendBtn, { backgroundColor: c }]}
            >
              <ArrowUp size={18} color="#fff" />
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      )}

      {/* Bottom nav */}
      <View style={styles.bottomNav}>
        {[
          { icon: Home, label: 'Home', key: 'home' },
          { icon: MessageCircle, label: 'Ask', key: 'chat' },
          { icon: Pill, label: 'Meds', key: 'meds' },
          { icon: User, label: 'You', key: 'me' },
        ].map((item) => {
          const active = tab === item.key;
          const IconComp = item.icon;
          return (
            <TouchableOpacity
              key={item.key}
              style={styles.navItem}
              onPress={() => {
                if (item.key === 'home' || item.key === 'chat') {
                  setTab(item.key as 'home' | 'chat');
                } else if (item.key === 'me') {
                  navigation.goBack();
                }
              }}
            >
              <View style={[styles.navIconContainer, { backgroundColor: active ? cBg : 'transparent' }]}>
                <IconComp size={20} color={active ? c : '#64748b'} />
              </View>
              <Text style={[styles.navText, { color: active ? c : '#64748b' }]}>{item.label}</Text>
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
  headerSub: { fontSize: 13, fontWeight: '500', color: '#8B6B3A' },
  headerTitle: { fontSize: 24, fontWeight: 'bold', color: '#3D2C12', marginTop: 6 },
  avatar: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center', borderWidth: 4, borderColor: '#fff' },
  avatarText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  scrollContent: { flex: 1, paddingHorizontal: 16, paddingTop: 4 },
  card: { backgroundColor: '#fff', borderRadius: 22, padding: 20, marginBottom: 14, shadowColor: '#D97706', shadowOpacity: 0.08, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  reassuranceHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  reassuranceIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#DCFCE7', justifyContent: 'center', alignItems: 'center' },
  reassuranceTitle: { fontSize: 15, fontWeight: 'bold', color: '#15803D' },
  reassuranceSub: { fontSize: 11, fontWeight: '500', color: '#64748B', marginTop: 4 },
  reassuranceBody: { fontSize: 15, fontWeight: '500', lineHeight: 22, color: '#0f172a' },
  vitalGrid: { flexDirection: 'row', gap: 10, marginTop: 16 },
  vitalTile: { flex: 1, backgroundColor: '#FFF9F1', borderRadius: 16, padding: 12, alignItems: 'center' },
  vitalKey: { fontSize: 9, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, color: '#64748B', marginBottom: 5 },
  vitalValue: { fontSize: 16, fontWeight: 'bold', color: '#3D2C12' },
  vitalUnit: { fontSize: 10, fontWeight: '500', color: '#64748B' },
  doseCard: { backgroundColor: '#fff', borderRadius: 22, padding: 16, marginBottom: 14, flexDirection: 'row', alignItems: 'center', gap: 14, shadowColor: '#D97706', shadowOpacity: 0.08, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  doseIcon: { width: 48, height: 48, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
  doseTitle: { fontSize: 15, fontWeight: 'bold', color: '#3D2C12' },
  doseSub: { fontSize: 12, fontWeight: '500', color: '#64748B', marginTop: 4 },
  remindBtn: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 9999 },
  remindBtnText: { fontSize: 12, fontWeight: '600', color: '#fff' },
  sectionLabel: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.6, color: '#8B6B3A', marginHorizontal: 4, marginTop: 14, marginBottom: 10 },
  teamCard: { backgroundColor: '#fff', borderRadius: 18, padding: 14, marginBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 12, shadowColor: '#0f172a', shadowOpacity: 0.04, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  teamAvatar: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  teamName: { fontSize: 14, fontWeight: '600', color: '#0f172a' },
  teamRole: { fontSize: 12, fontWeight: '500', color: '#64748B', marginTop: 4 },
  teamAction: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#f1f5f9', justifyContent: 'center', alignItems: 'center' },
  aiLabel: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 4, marginLeft: 8 },
  aiLabelText: { fontSize: 10, fontWeight: '600', color: '#2563EB', textTransform: 'uppercase', letterSpacing: 0.5 },
  bubble: { maxWidth: '80%', paddingHorizontal: 15, paddingVertical: 12, borderRadius: 20, shadowColor: '#0f172a', shadowOpacity: 0.05, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  bubbleText: { fontSize: 14, lineHeight: 21 },
  inputBar: { flexDirection: 'row', alignItems: 'center', padding: 10, paddingHorizontal: 12, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#f1f5f9', gap: 8 },
  chatInput: { flex: 1, fontSize: 14, paddingHorizontal: 16, paddingVertical: 12, borderRadius: 9999, borderWidth: 1, borderColor: '#e5e7eb', backgroundColor: '#FFF9F1', color: '#0f172a' },
  sendBtn: { width: 42, height: 42, borderRadius: 21, justifyContent: 'center', alignItems: 'center' },
  bottomNav: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 80, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#f1f5f9', flexDirection: 'row', paddingBottom: Platform.OS === 'ios' ? 20 : 12, paddingTop: 8 },
  navItem: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4 },
  navIconContainer: { width: 44, height: 32, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
  navText: { fontSize: 10, fontWeight: '600' },
});

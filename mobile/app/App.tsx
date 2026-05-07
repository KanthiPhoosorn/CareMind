import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { View, Text, StyleSheet } from 'react-native';
import { APP_NAME } from '@caremind/shared';

export default function App() {
  return (
    <SafeAreaProvider>
      <NavigationContainer>
        <View style={styles.container}>
          <Text style={styles.title}>{APP_NAME}</Text>
          <Text style={styles.subtitle}>Patient Care Coordination</Text>
        </View>
        <StatusBar style="auto" />
      </NavigationContainer>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  title: { fontSize: 32, fontWeight: 'bold', color: '#2563EB' },
  subtitle: { fontSize: 16, color: '#6B7280', marginTop: 8 },
});

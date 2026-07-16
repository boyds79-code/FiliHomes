import React, { useState, useRef } from 'react';
import { StyleSheet, View, Text, TextInput, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { supabase } from '../lib/supabase';

export default function AuthScreen({ navigation }: any) {
  const [email, setEmail] = useState('boyds79@gmail.com');
  const [password, setPassword] = useState('password123');
  const [loading, setLoading] = useState(false);

  const doorCounter = useRef(0);

  const handleTriggerSecretDoor = () => {
    doorCounter.current += 1;
    
    if (doorCounter.current >= 5) {
      doorCounter.current = 0;
      navigation.navigate('FiliStaffSecretDoor');
    }
  };

  async function signInWithEmail() {
    if (!email || !password) {
      Alert.alert('Notice', 'Please enter your email and password.');
      return;
    }
    
    setLoading(true);
    
    const { error } = await supabase.auth.signInWithPassword({
      email: email,
      password: password,
    });

    if (error) {
      Alert.alert('Login Failed', error.message);
    }
    
    setLoading(false);
  }

  return (
    <View style={styles.container}>
      <TouchableOpacity activeOpacity={1} onPress={handleTriggerSecretDoor} style={{ paddingVertical: 10 }}>
        <Text style={styles.title}>FiliHomes Login</Text>
      </TouchableOpacity>

      <View style={[styles.verticallySpaced, styles.mt20]}>
        <TextInput style={styles.input} onChangeText={setEmail} value={email} placeholder="email@address.com" autoCapitalize={'none'} keyboardType="email-address" />
      </View>
      <View style={styles.verticallySpaced}>
        <TextInput style={styles.input} onChangeText={setPassword} value={password} secureTextEntry={true} placeholder="Password" autoCapitalize={'none'} />
      </View>
      <View style={[styles.verticallySpaced, styles.mt20]}>
        <TouchableOpacity style={styles.button} disabled={loading} onPress={signInWithEmail}>
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Sign In</Text>}
        </TouchableOpacity>
      </View>

      <View style={[styles.verticallySpaced, styles.mt10]}>
        <TouchableOpacity style={styles.signUpBtn} onPress={() => navigation.navigate('SignUpScreen')}>
          <Text style={styles.signUpBtnText}>Sign Up & Link Unit</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, flex: 1, justifyContent: 'center', backgroundColor: '#fff' },
  title: { fontSize: 24, fontWeight: 'bold', textAlign: 'center', marginBottom: 40, color: '#0038a8' },
  verticallySpaced: { paddingTop: 4, paddingBottom: 4, alignSelf: 'stretch' },
  mt20: { marginTop: 20 },
  mt10: { marginTop: 10 },
  input: { height: 50, borderWidth: 1, borderColor: '#ccc', borderRadius: 8, paddingHorizontal: 15, fontSize: 16, backgroundColor: '#f9f9f9' },
  button: { backgroundColor: '#0038a8', height: 50, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  buttonText: { color: '#fff', fontSize: 18, fontWeight: '600' },
  signUpBtn: { height: 50, borderRadius: 8, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#0038a8', backgroundColor: '#fff' },
  signUpBtnText: { color: '#0038a8', fontSize: 16, fontWeight: '600' },
});

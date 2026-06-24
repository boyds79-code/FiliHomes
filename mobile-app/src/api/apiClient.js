import { Platform } from 'react-native';
import Constants from 'expo-constants';

const getLocalIp = () => {
  const hostUri = Constants.expoConfig?.hostUri;
  if (hostUri) {
    return hostUri.split(':')[0];
  }
  return '192.168.1.19'; // Fallback
};

const LOCAL_IP = getLocalIp();

export const API_BASE_URL = __DEV__ 
  ? `http://${LOCAL_IP}:3000`
  : 'https://hey-driver.com';
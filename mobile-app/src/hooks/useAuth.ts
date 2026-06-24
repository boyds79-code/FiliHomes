import { useState, useEffect } from 'react';
import { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [isFirstLogin, setIsFirstLogin] = useState(false);

  useEffect(() => {
    // 1. 앱 구동 시 로컬 세션 체크 (자동 로그인 인프라)
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      checkIfFirstLogin(session);
      setLoading(false);
    });

    // 2. 세션 상태 변경 리스너 (로그인/로그아웃/비밀번호 변경 감지)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      checkIfFirstLogin(session);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  // 3. 최초 로그인 여부 검증 로직
  const checkIfFirstLogin = async (currentSession: Session | null) => {
    if (!currentSession) {
      setIsFirstLogin(false);
      return;
    }

    // 사용자의 메타데이터를 확인하여 비밀번호를 한 번도 바꾸지 않았는지 검증
    const isPasswordChanged = currentSession.user.user_metadata?.password_changed;
    setIsFirstLogin(!isPasswordChanged);
  };

  // 4. 최초 로그인 유저 전용 비밀번호 강제 업데이트 함수
  const updateInitialPassword = async (newPassword: string) => {
    const { data, error } = await supabase.auth.updateUser({
      password: newPassword,
      data: { password_changed: true } // 메타데이터에 플래그 기록
    });

    if (error) throw error;
    setIsFirstLogin(false);
    return data;
  };

  return {
    session,
    loading,
    isFirstLogin,
    updateInitialPassword,
  };
}
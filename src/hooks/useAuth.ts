import { useState, useEffect } from 'react';
import {
  AuthState,
  getAuthState,
  subscribeToAuth,
  signInWithEmail,
  signUpWithEmail,
  signOutUser,
  resetPasswordForEmail,
  updateUserPassword,
} from '../lib/auth';

export function useAuth() {
  const [state, setState] = useState<AuthState>(getAuthState());

  useEffect(() => {
    const unsubscribe = subscribeToAuth((next) => {
      setState(next);
    });
    return unsubscribe;
  }, []);

  return {
    user: state.user,
    session: state.session,
    loading: state.loading,
    email: state.email,
    name: state.name,
    role: state.role,
    isAuthenticated: Boolean(state.session?.user || state.email),
    signIn: signInWithEmail,
    signUp: signUpWithEmail,
    signOut: signOutUser,
    resetPassword: resetPasswordForEmail,
    updatePassword: updateUserPassword,
  };
}

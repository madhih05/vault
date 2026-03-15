import { useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { login, resetPasswordWithKey } from '../services/api'

export default function LoginScreen({ onLoginSuccess }) {
  const [formState, setFormState] = useState({ username: '', password: '' })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [resetOpen, setResetOpen] = useState(false)
  const [resetSubmitting, setResetSubmitting] = useState(false)
  const [resetErrorMessage, setResetErrorMessage] = useState('')
  const [resetSuccessMessage, setResetSuccessMessage] = useState('')
  const [resetFormState, setResetFormState] = useState({
    username: '',
    recoveryKey: '',
    newPassword: '',
  })

  const canSubmit = useMemo(() => {
    return Boolean(formState.username.trim() && formState.password.trim() && !isSubmitting)
  }, [formState, isSubmitting])

  const handleSubmit = async () => {
    setIsSubmitting(true)
    setErrorMessage('')

    try {
      await login({
        username: formState.username.trim(),
        password: formState.password,
      })
      onLoginSuccess()
    } catch (error) {
      const message =
        error?.response?.data?.error ||
        error?.response?.data?.message ||
        error?.message ||
        'Login failed. Verify your credentials and try again.'
      setErrorMessage(message)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleReset = async () => {
    setResetSubmitting(true)
    setResetErrorMessage('')
    setResetSuccessMessage('')

    try {
      await resetPasswordWithKey({
        username: resetFormState.username.trim(),
        recoveryKey: resetFormState.recoveryKey.trim().toUpperCase(),
        newPassword: resetFormState.newPassword,
      })

      setResetSuccessMessage('Password reset successful. You can now sign in.')
      setResetFormState({ username: '', recoveryKey: '', newPassword: '' })
    } catch (error) {
      const message =
        error?.response?.data?.error ||
        error?.response?.data?.message ||
        error?.message ||
        'Unable to reset password. Please verify your details.'
      setResetErrorMessage(message)
    } finally {
      setResetSubmitting(false)
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          <Text style={styles.title}>Vault Sign In</Text>
          <Text style={styles.subtitle}>Authenticate to open your private vault dashboard.</Text>

          <TextInput
            style={styles.input}
            placeholder="Username"
            placeholderTextColor="#64748b"
            autoCapitalize="none"
            value={formState.username}
            onChangeText={(value) => setFormState((prev) => ({ ...prev, username: value }))}
          />
          <TextInput
            style={styles.input}
            placeholder="Password"
            placeholderTextColor="#64748b"
            secureTextEntry
            value={formState.password}
            onChangeText={(value) => setFormState((prev) => ({ ...prev, password: value }))}
          />

          {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

          <Pressable style={[styles.primaryButton, !canSubmit && styles.disabled]} disabled={!canSubmit} onPress={handleSubmit}>
            {isSubmitting ? <ActivityIndicator color="#020617" /> : <Text style={styles.primaryLabel}>Enter Vault</Text>}
          </Pressable>

          <Pressable
            style={styles.secondaryButton}
            onPress={() => {
              setResetOpen(true)
              setResetErrorMessage('')
              setResetSuccessMessage('')
            }}
          >
            <Text style={styles.secondaryLabel}>Reset Password</Text>
          </Pressable>
        </View>
      </ScrollView>

      <Modal visible={resetOpen} transparent animationType="slide" onRequestClose={() => setResetOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Reset Password</Text>

            <TextInput
              style={styles.input}
              placeholder="Username"
              placeholderTextColor="#64748b"
              autoCapitalize="none"
              value={resetFormState.username}
              onChangeText={(value) => setResetFormState((prev) => ({ ...prev, username: value }))}
            />
            <TextInput
              style={styles.input}
              placeholder="Recovery Key (XXXX-XXXX-XXXX-XXXX)"
              placeholderTextColor="#64748b"
              autoCapitalize="characters"
              value={resetFormState.recoveryKey}
              onChangeText={(value) => setResetFormState((prev) => ({ ...prev, recoveryKey: value }))}
            />
            <TextInput
              style={styles.input}
              placeholder="New Password"
              placeholderTextColor="#64748b"
              secureTextEntry
              value={resetFormState.newPassword}
              onChangeText={(value) => setResetFormState((prev) => ({ ...prev, newPassword: value }))}
            />

            {resetErrorMessage ? <Text style={styles.errorText}>{resetErrorMessage}</Text> : null}
            {resetSuccessMessage ? <Text style={styles.successText}>{resetSuccessMessage}</Text> : null}

            <Pressable style={styles.primaryButton} disabled={resetSubmitting} onPress={handleReset}>
              {resetSubmitting ? <ActivityIndicator color="#020617" /> : <Text style={styles.primaryLabel}>Reset Password</Text>}
            </Pressable>
            <Pressable style={styles.secondaryButton} onPress={() => setResetOpen(false)}>
              <Text style={styles.secondaryLabel}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#020617',
  },
  container: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  card: {
    width: '100%',
    maxWidth: 450,
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 16,
    padding: 18,
    gap: 12,
  },
  title: {
    color: '#e2e8f0',
    fontSize: 24,
    fontWeight: '700',
  },
  subtitle: {
    color: '#94a3b8',
    fontSize: 13,
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#334155',
    backgroundColor: '#0b1222',
    color: '#e2e8f0',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  primaryButton: {
    backgroundColor: '#22d3ee',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryLabel: {
    color: '#020617',
    fontWeight: '700',
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  secondaryLabel: {
    color: '#e2e8f0',
    fontWeight: '600',
  },
  disabled: {
    opacity: 0.5,
  },
  errorText: {
    color: '#fca5a5',
    fontSize: 13,
  },
  successText: {
    color: '#86efac',
    fontSize: 13,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(2,6,23,0.8)',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: {
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 16,
    padding: 16,
    gap: 10,
  },
  modalTitle: {
    color: '#e2e8f0',
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 4,
  },
})

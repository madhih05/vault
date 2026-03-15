import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'

export default function ChangePasswordModal({
  visible,
  formState,
  onChange,
  onClose,
  onSubmit,
  submitting,
  error,
  success,
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>Change Password</Text>

          <TextInput
            style={styles.input}
            placeholder="Current Password"
            placeholderTextColor="#64748b"
            secureTextEntry
            value={formState.currentPassword}
            onChangeText={(value) => onChange('currentPassword', value)}
          />
          <TextInput
            style={styles.input}
            placeholder="New Password"
            placeholderTextColor="#64748b"
            secureTextEntry
            value={formState.newPassword}
            onChangeText={(value) => onChange('newPassword', value)}
          />

          {error ? <Text style={styles.error}>{error}</Text> : null}
          {success ? <Text style={styles.success}>{success}</Text> : null}

          <Pressable style={styles.primaryButton} disabled={submitting} onPress={onSubmit}>
            {submitting ? <ActivityIndicator color="#020617" /> : <Text style={styles.primaryLabel}>Update Password</Text>}
          </Pressable>

          <Pressable style={styles.secondaryButton} onPress={onClose}>
            <Text style={styles.secondaryLabel}>Close</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(2,6,23,0.8)',
    justifyContent: 'center',
    padding: 20,
  },
  card: {
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 16,
    padding: 16,
    gap: 10,
  },
  title: {
    color: '#e2e8f0',
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 6,
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
  error: {
    color: '#fca5a5',
    fontSize: 13,
  },
  success: {
    color: '#86efac',
    fontSize: 13,
  },
})

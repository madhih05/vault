import { ActivityIndicator, Image, Linking, Modal, Pressable, StyleSheet, Text, View } from 'react-native'

function isImage(file) {
  return String(file?.mimeType || '').startsWith('image/')
}

export default function PreviewModal({ visible, file, token, onClose, onDelete, deleting }) {
  if (!file) {
    return null
  }

  const previewUrl = `${file.viewUrl}${file.viewUrl.includes('?') ? '&' : '?'}token=${encodeURIComponent(token || '')}`

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={styles.row}>
            <Text style={styles.title} numberOfLines={1}>
              {file.originalName}
            </Text>
            <View style={styles.rowButtons}>
              <Pressable style={styles.deleteButton} onPress={onDelete} disabled={deleting}>
                <Text style={styles.deleteLabel}>{deleting ? 'Deleting...' : 'Delete'}</Text>
              </Pressable>
              <Pressable style={styles.closeButton} onPress={onClose}>
                <Text style={styles.closeLabel}>Close</Text>
              </Pressable>
            </View>
          </View>

          <View style={styles.previewArea}>
            {isImage(file) ? (
              <Image source={{ uri: previewUrl }} style={styles.image} resizeMode="contain" />
            ) : (
              <Pressable style={styles.openButton} onPress={() => Linking.openURL(previewUrl)}>
                <Text style={styles.openLabel}>Open this file in external app</Text>
              </Pressable>
            )}
          </View>

          {!isImage(file) ? (
            <Text style={styles.hint}>Video/audio/document previews open using native file handlers.</Text>
          ) : null}
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(2,6,23,0.9)',
    justifyContent: 'center',
    padding: 12,
  },
  card: {
    backgroundColor: '#0f172a',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#334155',
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
    gap: 8,
  },
  title: {
    flex: 1,
    color: '#e2e8f0',
    fontSize: 14,
    fontWeight: '600',
  },
  rowButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  closeButton: {
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  closeLabel: {
    color: '#e2e8f0',
    fontSize: 12,
  },
  deleteButton: {
    borderWidth: 1,
    borderColor: '#7f1d1d',
    backgroundColor: '#450a0a',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  deleteLabel: {
    color: '#fecaca',
    fontSize: 12,
  },
  previewArea: {
    minHeight: 320,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#020617',
  },
  image: {
    width: '100%',
    height: 360,
  },
  openButton: {
    borderWidth: 1,
    borderColor: '#22d3ee',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  openLabel: {
    color: '#22d3ee',
    fontWeight: '600',
  },
  hint: {
    color: '#94a3b8',
    fontSize: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
})

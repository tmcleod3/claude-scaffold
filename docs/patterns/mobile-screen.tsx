/**
 * Pattern: React Native Screen with All States
 *
 * Key principles:
 * - Every screen handles: loading, empty, error, and success states (same as web component.tsx)
 * - Safe area insets respected — content never under the notch or home indicator
 * - Navigation follows platform conventions (back swipe iOS, hardware back Android)
 * - Touch targets minimum 44pt (iOS) / 48dp (Android)
 * - Keyboard avoidance on all forms
 * - Supports Dynamic Type / system font scaling
 * - Reduced motion respected via useReducedMotion()
 *
 * Agents: Legolas (code), Samwise-Mobile (a11y), Bilbo (copy), Gimli (performance)
 *
 * Framework adaptations:
 *   React Native: This file
 *   Flutter: Same 4-state pattern with StatefulWidget, SafeArea, MediaQuery
 *   SwiftUI: NavigationStack, .safeAreaInset, @Environment(\.dynamicTypeSize)
 *
 * The framework changes, the principle doesn't:
 * EVERY screen handles loading, empty, error, and success. Safe area is non-negotiable.
 */

import React from 'react'
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  StyleSheet,
  Platform,
  AccessibilityInfo,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useNavigation } from '@react-navigation/native'

// --- Types ---
interface Project {
  id: string
  name: string
  description: string | null
}

interface ProjectListScreenProps {
  projects: Project[]
  isLoading: boolean
  error: string | null
  onRefresh: () => void
  onDelete: (id: string) => void
}

export function ProjectListScreen({
  projects,
  isLoading,
  error,
  onRefresh,
  onDelete,
}: ProjectListScreenProps) {
  const insets = useSafeAreaInsets()
  const navigation = useNavigation()

  // Loading state — full-screen spinner with a11y announcement
  if (isLoading && projects.length === 0) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]} accessibilityRole="progressbar">
        <ActivityIndicator size="large" />
        <Text style={styles.loadingText} accessibilityLiveRegion="polite">
          Loading projects...
        </Text>
      </View>
    )
  }

  // Error state — actionable, not just "something went wrong"
  if (error) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]} accessibilityRole="alert">
        <Text style={styles.errorTitle}>Couldn't load your projects</Text>
        <Text style={styles.errorMessage}>{error}</Text>
        <TouchableOpacity
          onPress={onRefresh}
          style={styles.retryButton}
          accessibilityRole="button"
          accessibilityLabel="Retry loading projects"
        >
          <Text style={styles.retryText}>Try Again</Text>
        </TouchableOpacity>
      </View>
    )
  }

  // Empty state — guide the user
  if (projects.length === 0) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <Text style={styles.emptyTitle}>No projects yet</Text>
        <Text style={styles.emptyMessage}>Create your first project to get started.</Text>
      </View>
    )
  }

  // Success state — pull-to-refresh list
  return (
    <FlatList
      data={projects}
      keyExtractor={(item) => item.id}
      contentContainerStyle={{ paddingTop: insets.top, paddingBottom: insets.bottom }}
      refreshControl={<RefreshControl refreshing={isLoading} onRefresh={onRefresh} />}
      renderItem={({ item }) => (
        <TouchableOpacity
          style={styles.card}
          onPress={() => navigation.navigate('ProjectDetail', { id: item.id })}
          accessibilityRole="button"
          accessibilityLabel={`Open ${item.name}`}
          // Touch target: minimum 44pt height enforced by card padding
        >
          <Text style={styles.cardTitle}>{item.name}</Text>
          {item.description && <Text style={styles.cardDescription}>{item.description}</Text>}
        </TouchableOpacity>
      )}
    />
  )
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  loadingText: { marginTop: 12, fontSize: 16, color: '#666' },
  errorTitle: { fontSize: 18, fontWeight: '600', color: '#dc2626' },
  errorMessage: { marginTop: 4, fontSize: 14, color: '#dc2626', textAlign: 'center' },
  retryButton: { marginTop: 16, paddingHorizontal: 20, paddingVertical: 12, backgroundColor: '#dc2626', borderRadius: 8 },
  retryText: { color: '#fff', fontWeight: '600' },
  emptyTitle: { fontSize: 18, fontWeight: '600', color: '#111' },
  emptyMessage: { marginTop: 4, fontSize: 14, color: '#666' },
  card: { padding: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: '#e5e7eb', minHeight: 44 },
  cardTitle: { fontSize: 16, fontWeight: '600', color: '#111' },
  cardDescription: { marginTop: 4, fontSize: 14, color: '#666' },
})

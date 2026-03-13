/**
 * Pattern: React Component with All States
 *
 * Key principles:
 * - Every component handles: loading, empty, error, and success states
 * - Keyboard accessible — interactive elements focusable, no mouse-only actions
 * - Semantic HTML — use the right element, not div-with-onClick
 * - Loading states prevent layout shift (skeleton matches content shape)
 * - Error states are actionable — tell the user what to do
 * - Empty states guide — never just show blank space
 *
 * Agents: Legolas (code), Samwise (a11y), Bilbo (copy), Gimli (performance)
 *
 * Framework adaptations:
 *   Next.js/React: This file (JSX, hooks, 'use client')
 *   Vue: Same 4-state pattern with v-if/v-else, <template> blocks
 *   Svelte: Same pattern with {#if}/{:else} blocks
 *   Django templates: Conditional blocks for each state, HTMX for loading
 *   Rails: Turbo Frames for loading states, partials for each state
 *
 * The framework changes, the principle doesn't:
 * EVERY data-driven component handles loading, empty, error, and success.
 */

'use client'

import { useState } from 'react'

// --- Types co-located with component ---
interface Project {
  id: string
  name: string
  description: string | null
  createdAt: string
}

interface ProjectListProps {
  projects: Project[]
  isLoading: boolean
  error: string | null
  onDelete: (id: string) => void
  onRetry: () => void
}

// --- Main component ---
export function ProjectList({
  projects,
  isLoading,
  error,
  onDelete,
  onRetry,
}: ProjectListProps) {
  // Loading state — skeleton matches content shape (Gimli — no layout shift)
  if (isLoading) {
    return (
      <div role="status" aria-label="Loading projects">
        <ul className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <li key={i} className="h-16 rounded-lg bg-gray-100 animate-pulse" />
          ))}
        </ul>
        <span className="sr-only">Loading projects...</span>
      </div>
    )
  }

  // Error state — actionable, not just "something went wrong" (Bilbo — clear copy)
  if (error) {
    return (
      <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4">
        <p className="font-medium text-red-800">Couldn't load your projects</p>
        <p className="mt-1 text-sm text-red-600">{error}</p>
        <button
          onClick={onRetry}
          className="mt-3 text-sm font-medium text-red-700 underline hover:text-red-800"
        >
          Try again
        </button>
      </div>
    )
  }

  // Empty state — guide the user, don't show blank (Bilbo — helpful copy)
  if (projects.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-gray-300 p-8 text-center">
        <p className="font-medium text-gray-900">No projects yet</p>
        <p className="mt-1 text-sm text-gray-500">
          Create your first project to get started.
        </p>
      </div>
    )
  }

  // Success state
  return (
    <ul className="space-y-3" role="list">
      {projects.map((project) => (
        <ProjectCard key={project.id} project={project} onDelete={onDelete} />
      ))}
    </ul>
  )
}

// --- Sub-component ---
function ProjectCard({
  project,
  onDelete,
}: {
  project: Project
  onDelete: (id: string) => void
}) {
  const [confirmDelete, setConfirmDelete] = useState(false)

  return (
    <li className="flex items-center justify-between rounded-lg border p-4">
      <div>
        <h3 className="font-medium text-gray-900">{project.name}</h3>
        {project.description && (
          <p className="mt-0.5 text-sm text-gray-500">{project.description}</p>
        )}
      </div>

      {/* Dangerous action requires confirmation (Gandalf — safety) */}
      {confirmDelete ? (
        <div className="flex gap-2" role="group" aria-label="Confirm deletion">
          <button
            onClick={() => {
              onDelete(project.id)
              setConfirmDelete(false)
            }}
            className="rounded bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700"
            aria-label={`Confirm delete ${project.name}`}
          >
            Delete
          </button>
          <button
            onClick={() => setConfirmDelete(false)}
            className="rounded border px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
        </div>
      ) : (
        <button
          onClick={() => setConfirmDelete(true)}
          className="rounded border px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
          aria-label={`Delete ${project.name}`}
        >
          Delete
        </button>
      )}
    </li>
  )
}

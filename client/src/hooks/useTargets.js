/**
 * @file hooks/useTargets.js
 * @description Computes project word-count totals, session progress, and daily pace.
 *
 * - totalWords: sum of word_count across all documents in the active project.
 * - sessionWords: words written since the session baseline was set (resets daily at midnight).
 * - wordsPerDay: words needed per remaining day to hit the project target by the deadline.
 *
 * Session baseline is stored in localStorage as { date: 'YYYY-MM-DD', baseline: number }
 * keyed by project ID. On midnight rollover a setTimeout resets the baseline automatically.
 */

import { useEffect, useRef } from 'react';
import { useBinderStore } from '../store/binderStore.js';
import { prefs } from '../utils/storage.js';

function todayStr() {
  return new Date().toISOString().slice(0, 10); // 'YYYY-MM-DD'
}

function msUntilMidnight() {
  const now  = new Date();
  const next = new Date(now);
  next.setHours(24, 0, 0, 0);
  return next - now;
}

function loadBaseline(projectId) {
  return prefs.sessionBaseline(projectId).get(); // { date, baseline } | null
}

function saveBaseline(projectId, baseline) {
  prefs.sessionBaseline(projectId).set({ date: todayStr(), baseline });
}

function calcWordsPerDay(deadline, targetWords, currentWords) {
  if (!deadline || !targetWords) return null;
  const remaining = Math.max(0, targetWords - currentWords);
  const dl  = new Date(deadline + 'T00:00:00');
  const now = new Date(); now.setHours(0, 0, 0, 0);
  const daysLeft = Math.ceil((dl - now) / 86_400_000);
  if (daysLeft <= 0) return null;
  return Math.ceil(remaining / daysLeft);
}

export function useTargets() {
  const documents       = useBinderStore((s) => s.documents);
  const projects        = useBinderStore((s) => s.projects);
  const activeProjectId = useBinderStore((s) => s.activeProjectId);

  const project    = projects.find((p) => p.id === activeProjectId) ?? null;
  const totalWords = documents
    .filter((d) => d.type === 'scene')
    .reduce((sum, d) => sum + (d.word_count ?? 0), 0);

  // Ref holds the session baseline word count. Null = needs initializing.
  const baselineRef    = useRef(null);
  // Tracks document IDs present when the baseline was last set, so newly
  // created documents can have their initial word_count absorbed into the
  // baseline (preventing template content from inflating session counts).
  const knownDocIdsRef = useRef(null);

  // Reset baseline ref when the active project changes
  /* eslint-disable react-hooks/refs */
  const prevProjectId = useRef(activeProjectId);
  if (prevProjectId.current !== activeProjectId) {
    prevProjectId.current  = activeProjectId;
    baselineRef.current    = null;
    knownDocIdsRef.current = null;
  }

  // Initialize or refresh baseline on each render (handles project switch + date change)
  if (activeProjectId != null) {
    if (baselineRef.current === null) {
      const stored = loadBaseline(activeProjectId);
      if (!stored || stored.date !== todayStr()) {
        saveBaseline(activeProjectId, totalWords);
        baselineRef.current = totalWords;
      } else {
        // Clamp to totalWords in case the stored baseline is stale (e.g., was
        // saved when non-scene docs were included in the total). Without this,
        // baseline > totalWords keeps sessionWords permanently at 0.
        baselineRef.current = Math.min(stored.baseline, totalWords);
        if (baselineRef.current !== stored.baseline) {
          saveBaseline(activeProjectId, baselineRef.current);
        }
      }
      knownDocIdsRef.current = new Set(documents.map((d) => d.id));
    }
  } else {
    baselineRef.current    = null;
    knownDocIdsRef.current = null;
  }

  // When a document is created mid-session it arrives in the store with its
  // initial word_count already set (template words the user did not write).
  // Absorb that count into the baseline immediately so it doesn't show up as
  // session progress. This runs in the render body so sessionWords below
  // reflects the updated baseline in the same render cycle.
  if (knownDocIdsRef.current != null && baselineRef.current != null) {
    const newDocs = documents.filter((d) => !knownDocIdsRef.current.has(d.id));
    if (newDocs.length > 0) {
      const addedWords = newDocs
        .filter((d) => d.type === 'scene')
        .reduce((sum, d) => sum + (d.word_count ?? 0), 0);
      newDocs.forEach((d) => knownDocIdsRef.current.add(d.id));
      if (addedWords > 0) {
        baselineRef.current += addedWords;
        saveBaseline(activeProjectId, baselineRef.current);
      }
    }
  }

  // Schedule an automatic reset exactly at midnight
  useEffect(() => {
    if (activeProjectId == null) return;
    const id = setTimeout(() => {
      saveBaseline(activeProjectId, totalWords);
      baselineRef.current = totalWords;
    }, msUntilMidnight());
    return () => clearTimeout(id);
  }, [activeProjectId]); // eslint-disable-line react-hooks/exhaustive-deps

  const sessionWords = Math.max(0, totalWords - (baselineRef.current ?? totalWords));
  /* eslint-enable react-hooks/refs */

  return {
    totalWords,
    targetWords: project?.target_words ?? null,
    deadline:    project?.deadline     ?? null,
    sessionWords,
    wordsPerDay: calcWordsPerDay(project?.deadline, project?.target_words, totalWords),
  };
}

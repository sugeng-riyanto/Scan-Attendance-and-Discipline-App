'use client'

import { PairwiseResult, AccuracyResult, LiveTestResult } from './types'

export const FACE_MATCH_THRESHOLD = 0.6;
export const MIN_ACCURACY_PERCENT = 75;

let faceApiLoaded = false;
let faceApiLoading = false;

export async function loadFaceApiModels(): Promise<boolean> {
  if (faceApiLoaded) return true;
  if (faceApiLoading) {
    while (faceApiLoading) await new Promise(r => setTimeout(r, 100));
    return faceApiLoaded;
  }
  faceApiLoading = true;
  try {
    const faceapi = await import('@vladmandic/face-api');
    await faceapi.nets.ssdMobilenetv1.loadFromUri('/models');
    await faceapi.nets.faceLandmark68Net.loadFromUri('/models');
    await faceapi.nets.faceRecognitionNet.loadFromUri('/models');
    faceApiLoaded = true;
    return true;
  } catch (e) {
    console.error('Failed to load face-api models:', e);
    return false;
  } finally {
    faceApiLoading = false;
  }
}

export function euclideanDistanceLocal(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const diff = a[i] - b[i];
    sum += diff * diff;
  }
  return Math.sqrt(sum);
}

export function calculateFaceAccuracy(descriptors: number[][]): AccuracyResult {
  const defaultResult: AccuracyResult = {
    overallAccuracy: 0, pairwiseResults: [], minAccuracy: 0, maxAccuracy: 0,
    avgDistance: 0, status: 'poor', statusLabel: 'Tidak Cukup Data',
    statusColor: 'text-gray-500', recommendation: 'Capture minimal 2 foto wajah untuk menguji akurasi.'
  };

  if (descriptors.length < 2) return defaultResult;

  const pairwiseResults: PairwiseResult[] = [];
  let totalAccuracy = 0;
  let totalDistance = 0;
  let count = 0;

  for (let i = 0; i < descriptors.length; i++) {
    for (let j = i + 1; j < descriptors.length; j++) {
      const distance = euclideanDistanceLocal(descriptors[i], descriptors[j]);
      const accuracy = Math.max(0, (1 - distance) * 100);
      pairwiseResults.push({ i, j, distance, accuracy });
      totalAccuracy += accuracy;
      totalDistance += distance;
      count++;
    }
  }

  const overallAccuracy = count > 0 ? totalAccuracy / count : 0;
  const minAccuracy = pairwiseResults.length > 0 ? Math.min(...pairwiseResults.map(r => r.accuracy)) : 0;
  const maxAccuracy = pairwiseResults.length > 0 ? Math.max(...pairwiseResults.map(r => r.accuracy)) : 0;
  const avgDistance = count > 0 ? totalDistance / count : 0;

  let status: AccuracyResult['status'];
  let statusLabel: string;
  let statusColor: string;
  let recommendation: string;

  if (overallAccuracy >= 85) {
    status = 'excellent';
    statusLabel = 'Sangat Baik';
    statusColor = 'text-emerald-600';
    recommendation = 'Referensi wajah sangat konsisten. Sistem akan mengenali wajah dengan akurasi tinggi.';
  } else if (overallAccuracy >= 75) {
    status = 'good';
    statusLabel = 'Baik';
    statusColor = 'text-blue-600';
    recommendation = 'Referensi wajah cukup konsisten. Akurasi pengenalan wajah sudah memadai untuk presensi.';
  } else if (overallAccuracy >= 60) {
    status = 'warning';
    statusLabel = 'Perlu Perbaikan';
    statusColor = 'text-amber-600';
    recommendation = 'Konsistensi referensi wajah kurang baik. Disarankan untuk menghapus foto yang kurang jelas dan melakukan capture ulang dengan pencahayaan yang lebih baik.';
  } else {
    status = 'poor';
    statusLabel = 'Kurang Baik';
    statusColor = 'text-red-600';
    recommendation = 'Referensi wajah sangat tidak konsisten. Harap hapus semua foto dan lakukan capture ulang dengan kondisi pencahayaan yang baik dan wajah yang jelas terlihat.';
  }

  return { overallAccuracy, pairwiseResults, minAccuracy, maxAccuracy, avgDistance, status, statusLabel, statusColor, recommendation };
}

export function performLiveTest(liveDescriptor: number[], storedDescriptors: number[][]): LiveTestResult {
  const allResults = storedDescriptors.map((desc, index) => {
    const distance = euclideanDistanceLocal(liveDescriptor, desc);
    const accuracy = Math.max(0, (1 - distance) * 100);
    return { index, distance, accuracy };
  });

  const best = allResults.reduce((prev, curr) => curr.distance < prev.distance ? curr : prev, allResults[0]);

  return {
    matched: best.distance <= FACE_MATCH_THRESHOLD,
    bestDistance: best.distance,
    bestAccuracy: best.accuracy,
    bestIndex: best.index,
    allResults,
  };
}

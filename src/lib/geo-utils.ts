// Geolocation utility functions for school attendance system

export interface GeoLocation {
  lat: number;
  lng: number;
  accuracy?: number; // in meters
}

export interface GeofenceConfig {
  id: string;
  name: string;
  centerLat: number;
  centerLng: number;
  radiusMeters: number;
  isActive: boolean;
  isDefault: boolean;
}

/**
 * Calculate distance between two coordinates using Haversine formula
 * Returns distance in meters
 */
export function calculateDistance(
  lat1: number, lng1: number,
  lat2: number, lng2: number
): number {
  const R = 6371000; // Earth's radius in meters
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(deg: number): number {
  return deg * (Math.PI / 180);
}

/**
 * Check if a location is within a geofence
 */
export function isWithinGeofence(
  location: GeoLocation,
  geofence: { centerLat: number; centerLng: number; radiusMeters: number }
): { within: boolean; distance: number } {
  const distance = calculateDistance(
    location.lat, location.lng,
    geofence.centerLat, geofence.centerLng
  );
  return {
    within: distance <= geofence.radiusMeters,
    distance: Math.round(distance),
  };
}

/**
 * Validate geolocation for attendance check-in/out
 * Returns validation result with details
 */
export function validateGeolocation(
  location: GeoLocation | null | undefined,
  geofence: { centerLat: number; centerLng: number; radiusMeters: number } | null,
  options?: { maxAccuracy?: number; requireGeolocation?: boolean }
): { valid: boolean; reason?: string; distance?: number; accuracy?: number } {
  const maxAccuracy = options?.maxAccuracy ?? 100; // default 100m accuracy threshold
  const requireGeolocation = options?.requireGeolocation ?? false;

  // If no geofence configured, allow without geo check
  if (!geofence) {
    return { valid: true, reason: 'Tidak ada geofence yang dikonfigurasi' };
  }

  // If geolocation is required but not provided
  if (requireGeolocation && !location) {
    return { valid: false, reason: 'Lokasi GPS diperlukan untuk presensi' };
  }

  // If no location provided and not required, warn but allow
  if (!location) {
    return { valid: false, reason: 'Lokasi GPS tidak tersedia. Aktifkan GPS pada perangkat Anda.' };
  }

  // Check GPS accuracy
  if (location.accuracy && location.accuracy > maxAccuracy) {
    return {
      valid: false,
      reason: `Akurasi GPS terlalu rendah (${Math.round(location.accuracy)}m). Maksimal ${maxAccuracy}m. Coba lagi di lokasi terbuka.`,
      accuracy: location.accuracy,
    };
  }

  // Check if within geofence
  const { within, distance } = isWithinGeofence(location, geofence);

  if (!within) {
    return {
      valid: false,
      reason: `Anda berada di luar area sekolah (jarak ${distance}m dari titik presensi). Presensi hanya bisa dilakukan di area sekolah.`,
      distance,
      accuracy: location.accuracy,
    };
  }

  return {
    valid: true,
    distance,
    accuracy: location.accuracy,
  };
}

/**
 * Default school geofence (example coordinates - will be overridden by DB config)
 * This is a placeholder - real coordinates should be set via admin settings
 */
export const DEFAULT_GEOFENCE = {
  centerLat: -6.2088,  // Jakarta example
  centerLng: 106.8456,
  radiusMeters: 200,
};

/**
 * Geofence labels for UI
 */
export const geofenceLabels = {
  name: 'Nama Area',
  centerLat: 'Latitude Pusat',
  centerLng: 'Longitude Pusat',
  radiusMeters: 'Radius (meter)',
  isActive: 'Aktif',
  isDefault: 'Geofence Utama',
};

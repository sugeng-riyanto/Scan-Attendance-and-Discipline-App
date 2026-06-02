export interface Student {
  id: string; nisn: string; name: string; classId: string; qrCode: string;
  photoUrl?: string; gender?: string; totalViolationPoints: number; totalGoodPoints: number;
  address?: string; email?: string; phone?: string;   status?: string; photoBase64?: string; faceCaptureEnabled?: boolean;
  idCardVisibleToStudent?: boolean; idCardVisibleToParent?: boolean;
  class?: { id: string; name: string; level: string; academicYear?: { id: string; name: string } };
  user?: { id: string; username: string; name: string; role: string };
  parents?: { id: string; relationship: string; user: { id: string; name: string } }[];
  _count?: { faceReferences: number };
}

export interface ClassInfo {
  id: string; name: string; level: string; academicYearId: string;
  homeroomTeacherId?: string;
  homeroomTeacher?: { id: string; name: string };
  _count?: { students: number };
}

export interface AttendanceRecord {
  id: string; studentId: string; date: string; checkInTime?: string; checkOutTime?: string;
  status: string; checkInMethod?: string; checkOutMethod?: string;
  isLateArrival: boolean; isEarlyDeparture: boolean; verifiedByFace: boolean;
  geoVerified: boolean; deviceInfo?: string; notes?: string;
  checkInLat?: number; checkInLng?: number; checkInAccuracy?: number;
  student?: Student; permission?: any;
}

export interface ViolationRecord {
  id: string; studentId: string; categoryId: string; points: number;
  description?: string; date: string; recordedBy: string;
  student?: Student; category?: { id: string; name: string; code: string; level: string; defaultPoints: number };
  recorder?: { id: string; name: string };
}

export interface GoodDeedRecord {
  id: string; studentId: string; categoryId: string; points: number;
  description?: string; date: string; recordedBy: string;
  student?: Student; category?: { id: string; name: string; code: string; defaultPoints: number };
  recorder?: { id: string; name: string };
}

export interface PermissionRecord {
  id: string; studentId: string; type: string; reason: string;
  requestedBy: string; approvedBy?: string; status: string;
  date: string; startTime?: string; endTime?: string;
  student?: Student;
  attachmentData?: string;
  attachmentType?: string;
  attachmentName?: string;
}

export interface CategoryInfo {
  id: string; name: string; code: string; level?: string; defaultPoints: number; description?: string; isActive: boolean;
}

export interface CategoriesResponse {
  violationCategories: CategoryInfo[];
  goodDeedCategories: CategoryInfo[];
}

export interface GeofenceConfig {
  id: string; name: string; centerLat: number; centerLng: number;
  radiusMeters: number; isActive: boolean; isDefault: boolean;
}

export interface AcademicYearInfo {
  id: string; name: string; startDate: string; endDate: string; isActive: boolean;
}

export interface BehaviorAlert {
  id: string; studentId: string; alertType: string; message: string;
  threshold: number; isRead: boolean; targetRole: string;
  student?: Student;
}

export interface StatisticsData {
  period: string; dateRange: { start: string; end: string };
  totalStudents: number; totalAttendanceRecords: number; attendancePercentage: number;
  statusDistribution: { HADIR: number; TERLAMBAT: number; IZIN: number; SAKIT: number; ALPHA: number };
  timeSeriesData: { date: string; hadir: number; terlambat: number; izin: number; sakit: number; alpha: number }[];
  classComparison: { className: string; level: string; total: number; hadir: number; terlambat: number; alpha: number; percentage: number }[];
  topViolators: { id: string; name: string; nisn: string; className: string; violationPoints: number; goodPoints: number }[];
  topGoodStudents: { id: string; name: string; nisn: string; className: string; goodPoints: number }[];
  violationByCategory: { name: string; count: number; points: number }[];
  goodDeedByCategory: { name: string; count: number; points: number }[];
  totalViolationPoints: number; totalGoodPoints: number; totalViolations: number; totalGoodDeeds: number;
}

export interface PairwiseResult {
  i: number;
  j: number;
  distance: number;
  accuracy: number;
}

export interface AccuracyResult {
  overallAccuracy: number;
  pairwiseResults: PairwiseResult[];
  minAccuracy: number;
  maxAccuracy: number;
  avgDistance: number;
  status: 'excellent' | 'good' | 'warning' | 'poor';
  statusLabel: string;
  statusColor: string;
  recommendation: string;
}

export interface LiveTestResult {
  matched: boolean;
  bestDistance: number;
  bestAccuracy: number;
  bestIndex: number;
  allResults: { index: number; distance: number; accuracy: number }[];
}

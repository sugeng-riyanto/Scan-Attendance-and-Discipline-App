import QRCode from 'qrcode';

/**
 * Generate a QR code data URL for a student
 */
export async function generateQRCode(data: string): Promise<string> {
  try {
    const url = await QRCode.toDataURL(data, {
      width: 256,
      margin: 2,
      color: {
        dark: '#000000',
        light: '#ffffff',
      },
    });
    return url;
  } catch (err) {
    console.error('QR Code generation error:', err);
    return '';
  }
}

/**
 * Generate a unique QR code string for a student
 */
export function generateQRString(nisn: string, salt?: string): string {
  const s = salt || 'SCHOOL-ATTENDANCE-2024';
  // base64url encoding: base64 with +/ replaced by -_ and padding stripped
  const b64 = Buffer.from(nisn + s).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `SCH-${nisn}-${b64.slice(0, 8)}`;
}

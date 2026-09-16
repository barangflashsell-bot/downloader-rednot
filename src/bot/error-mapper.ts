import {
  RednoteInvalidUrlError,
  RednoteUnsupportedUrlError,
  RednoteResolveError,
  RednoteAccessError,
  RednoteMediaNotFoundError,
  RednoteNetworkError,
  RednoteParseError,
} from '../rednote/errors';
import {
  RednoteFileTooLargeError,
  RednoteInvalidContentTypeError,
  RednoteDownloadRedirectError,
  RednoteDownloadNetworkError,
  RednoteStorageError,
} from '../downloader/errors';

/**
 * Maps system and extraction errors to safe, user-friendly Indonesian messages
 * without leaking any internal paths, secrets, stack traces, or credentials.
 */
export function mapErrorToUserMessage(error: unknown): string {
  if (error instanceof RednoteInvalidUrlError) {
    return '❌ Link tidak valid. Pastikan format URL sudah benar.';
  }

  if (error instanceof RednoteUnsupportedUrlError) {
    return '❌ Link harus berasal dari Xiaohongshu/RedNote (xiaohongshu.com atau xhslink.com).';
  }

  if (error instanceof RednoteResolveError) {
    return '❌ Gagal menyelesaikan tautan pendek. Pastikan link masih aktif.';
  }

  if (error instanceof RednoteAccessError) {
    return '❌ Konten tidak dapat diakses saat ini (dibatasi oleh proteksi anti-bot/WAF platform Xiaohongshu). Konten privat atau memerlukan verifikasi tidak didukung.';
  }

  if (error instanceof RednoteMediaNotFoundError) {
    return '❌ Media publik tidak ditemukan pada postingan ini.';
  }

  if (error instanceof RednoteFileTooLargeError) {
    return '❌ File terlalu besar untuk batas yang ditentukan.';
  }

  if (error instanceof RednoteInvalidContentTypeError) {
    return '❌ Konten yang diterima bukan merupakan format media yang didukung.';
  }

  if (error instanceof RednoteDownloadRedirectError) {
    return '❌ Tautan media diarahkan ke host yang tidak diizinkan atau tidak aman.';
  }

  if (error instanceof RednoteDownloadNetworkError || error instanceof RednoteNetworkError) {
    return '❌ Gagal mengambil media dari server sumber karena kendala jaringan. Coba lagi nanti.';
  }

  if (error instanceof RednoteStorageError) {
    return '❌ Gagal menyimpan media ke penyimpanan persisten.';
  }

  if (error instanceof RednoteParseError) {
    return '❌ Gagal memproses struktur data postingan.';
  }

  // Fallback safe message
  return '❌ Terjadi kesalahan saat memproses link. Silakan coba beberapa saat lagi.';
}

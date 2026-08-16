import { spawnSync } from 'node:child_process';
import { renameSync, rmSync } from 'node:fs';

/* Falls back to null on anything unexpected so the caller can use -shortest, which
 * is imprecise but never depends on the header being truthful. */
export const probeDuration = (file) => {
  const probe = spawnSync(
    'ffprobe',
    ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file],
    { encoding: 'utf8' },
  );
  const seconds = Number.parseFloat(probe.stdout ?? '');
  return Number.isFinite(seconds) && seconds > 0 ? seconds : null;
};

/* Frame size and pixel shape of the first video stream plus container duration,
 * or null when the file cannot be probed — callers decide whether that is fatal.
 * `sar` is the sample (pixel) aspect ratio as a plain number: AVCHD cameras
 * store 1440×1080 with 4:3-wide pixels that players stretch to a 1920×1080
 * picture, so storage width times sar is the width the viewer actually sees.
 * An unset or nonsensical ratio means square pixels. */
export const probeVideo = (file) => {
  const probe = spawnSync(
    'ffprobe',
    [
      '-v', 'error',
      '-select_streams', 'v:0',
      '-show_entries', 'stream=width,height,sample_aspect_ratio',
      '-show_entries', 'format=duration',
      '-of', 'json',
      file,
    ],
    { encoding: 'utf8' },
  );
  try {
    const parsed = JSON.parse(probe.stdout ?? '');
    const { width, height, sample_aspect_ratio: ratio } = parsed.streams?.[0] ?? {};
    const duration = Number.parseFloat(parsed.format?.duration ?? '');
    if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) return null;
    const [num, den] = (ratio ?? '').split(':').map(Number);
    const sar = num > 0 && den > 0 ? num / den : 1;
    return { width, height, sar, duration: Number.isFinite(duration) && duration > 0 ? duration : null };
  } catch {
    return null;
  }
};

/*
 * Runs ffmpeg writing to `partial` and renames to `target` only on success.
 * ffmpeg writes the moov atom last — +faststart moves it to the front in a
 * second pass — so a run stopped with Ctrl+C leaves an unplayable file. Written
 * under the real name, that fragment carries a fresh mtime and every later run
 * then reports it as up to date, which is exactly how a 3 MB stub survived here.
 * Callers keep the .mp4 extension on `partial` because ffmpeg picks its muxer
 * from it.
 */
export function encode(args, partial, target) {
  const ffmpeg = spawnSync('ffmpeg', args, { stdio: ['ignore', 'ignore', 'pipe'], encoding: 'utf8' });
  if (ffmpeg.error || ffmpeg.status !== 0) {
    rmSync(partial, { force: true });
    return { ok: false, detail: ffmpeg.error?.message ?? ffmpeg.stderr?.trim().split('\n').slice(-5).join('\n') };
  }
  renameSync(partial, target);
  return { ok: true };
}

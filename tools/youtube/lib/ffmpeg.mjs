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

/* Frame size of the first video stream plus container duration, or null when the
 * file cannot be probed — callers decide whether that is fatal. */
export const probeVideo = (file) => {
  const probe = spawnSync(
    'ffprobe',
    [
      '-v', 'error',
      '-select_streams', 'v:0',
      '-show_entries', 'stream=width,height',
      '-show_entries', 'format=duration',
      '-of', 'json',
      file,
    ],
    { encoding: 'utf8' },
  );
  try {
    const parsed = JSON.parse(probe.stdout ?? '');
    const { width, height } = parsed.streams?.[0] ?? {};
    const duration = Number.parseFloat(parsed.format?.duration ?? '');
    if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) return null;
    return { width, height, duration: Number.isFinite(duration) && duration > 0 ? duration : null };
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

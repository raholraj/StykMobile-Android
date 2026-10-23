/**
 * Parse AI responses and apply styk-animation JSON to the live editor when possible.
 */

const ANIM_BLOCK = /```styk-animation\s*([\s\S]*?)```/i;

export function extractAnimationBlock(text) {
  if (!text) return null;
  const m = text.match(ANIM_BLOCK);
  if (!m) return null;
  try {
    return JSON.parse(m[1].trim());
  } catch (e) {
    console.warn('Styk AI: invalid animation JSON', e);
    return null;
  }
}

export function applyAnimationPlan(plan, editor) {
  if (!plan?.frames?.length) {
    return { ok: false, message: 'No frames in AI plan.', framesApplied: 0 };
  }
  if (editor && typeof editor.applyAiAnimation === 'function') {
    try {
      const n = editor.applyAiAnimation(plan);
      return { ok: true, message: `Applied ${n} frames: ${plan.title || 'AI animation'}`, framesApplied: n };
    } catch (e) {
      return { ok: false, message: `Apply failed: ${e.message}`, framesApplied: 0 };
    }
  }
  if (editor?.report?.keyframes && Array.isArray(editor.report.keyframes)) {
    try {
      const n = applyToReport(plan, editor);
      return { ok: true, message: `Applied ${n} frames via report: ${plan.title || 'AI animation'}`, framesApplied: n };
    } catch (e) {
      return { ok: false, message: `Report apply failed: ${e.message}`, framesApplied: 0 };
    }
  }
  return {
    ok: false,
    message: 'Animation JSON ready. Live apply needs editor hook — use presets or next build.',
    framesApplied: 0,
    plan,
  };
}

function applyToReport(plan, editor) {
  const report = editor.report;
  const frames = plan.frames;
  const base = report.keyframes[0] || report.keyframes[editor.frameIndex || 0];
  if (!base) throw new Error('No base keyframe');

  const newFrames = frames.map((f) => {
    const cloned = structuredClone ? structuredClone(base) : JSON.parse(JSON.stringify(base));
    if (typeof f.duration === 'number') cloned.duration = f.duration;
    const obj = cloned.objects?.[0] || cloned.object;
    if (obj && f.pose) {
      if (typeof f.pose.root_x === 'number') obj.root_x = f.pose.root_x;
      if (typeof f.pose.root_y === 'number') obj.root_y = f.pose.root_y;
      const segs = obj.figure?.segments || obj.segments;
      if (segs && f.pose.segments) {
        for (const [id, props] of Object.entries(f.pose.segments)) {
          const seg = segs.find(s => String(s.segment_id) === String(id));
          if (seg && typeof props.angle_rad === 'number') seg.angle_rad = props.angle_rad;
          if (seg && typeof props.length === 'number') seg.length = props.length;
        }
      }
    }
    if (cloned._styk) delete cloned._styk.frameId;
    return cloned;
  });

  if (report.keyframes.length <= 1) {
    report.keyframes = newFrames;
  } else {
    const idx = (editor.frameIndex ?? 0) + 1;
    report.keyframes.splice(idx, 0, ...newFrames);
  }
  if (typeof editor._initializeFrameIds === 'function') editor._initializeFrameIds();
  if (typeof editor.goToFrame === 'function') editor.goToFrame(Math.min(editor.frameIndex ?? 0, report.keyframes.length - 1));
  if (typeof editor.requestRedraw === 'function') editor.requestRedraw();
  if (typeof editor.notifyChange === 'function') editor.notifyChange();
  return newFrames.length;
}

export const PRESET_ANIMATIONS = {
  wave: {
    title: 'Wave hello',
    fps: 12,
    frames: [
      { duration: 2, label: 'rest', pose: { segments: { '5': { angle_rad: 2.1 }, '6': { angle_rad: 1.8 } } } },
      { duration: 1, label: 'up', pose: { segments: { '5': { angle_rad: 0.3 }, '6': { angle_rad: 0.5 } } } },
      { duration: 1, label: 'wave1', pose: { segments: { '5': { angle_rad: 0.3 }, '6': { angle_rad: -0.4 } } } },
      { duration: 1, label: 'wave2', pose: { segments: { '5': { angle_rad: 0.3 }, '6': { angle_rad: 0.6 } } } },
      { duration: 1, label: 'wave3', pose: { segments: { '5': { angle_rad: 0.3 }, '6': { angle_rad: -0.3 } } } },
      { duration: 2, label: 'down', pose: { segments: { '5': { angle_rad: 2.1 }, '6': { angle_rad: 1.8 } } } },
    ],
    notes: 'Right arm wave.',
  },
  jump: {
    title: 'Jump',
    fps: 12,
    frames: [
      { duration: 2, label: 'stand', pose: { root_y: 300, segments: { '7': { angle_rad: 1.2 }, '8': { angle_rad: 1.55 }, '9': { angle_rad: 1.95 }, '10': { angle_rad: 1.55 } } } },
      { duration: 2, label: 'crouch', pose: { root_y: 340, segments: { '7': { angle_rad: 0.9 }, '8': { angle_rad: 2.1 }, '9': { angle_rad: 2.2 }, '10': { angle_rad: 1.0 } } } },
      { duration: 1, label: 'launch', pose: { root_y: 260, segments: { '7': { angle_rad: 1.4 }, '8': { angle_rad: 1.4 }, '9': { angle_rad: 1.7 }, '10': { angle_rad: 1.4 }, '3': { angle_rad: 0.5 }, '5': { angle_rad: 2.6 } } } },
      { duration: 2, label: 'air', pose: { root_y: 200, segments: { '7': { angle_rad: 1.0 }, '8': { angle_rad: 1.2 }, '9': { angle_rad: 2.1 }, '10': { angle_rad: 1.9 } } } },
      { duration: 1, label: 'fall', pose: { root_y: 280, segments: { '7': { angle_rad: 1.15 }, '8': { angle_rad: 1.5 }, '9': { angle_rad: 2.0 }, '10': { angle_rad: 1.5 } } } },
      { duration: 2, label: 'land', pose: { root_y: 340, segments: { '7': { angle_rad: 0.95 }, '8': { angle_rad: 2.0 }, '9': { angle_rad: 2.15 }, '10': { angle_rad: 1.1 } } } },
      { duration: 2, label: 'settle', pose: { root_y: 300, segments: { '7': { angle_rad: 1.2 }, '8': { angle_rad: 1.55 }, '9': { angle_rad: 1.95 }, '10': { angle_rad: 1.55 } } } },
    ],
    notes: 'Simple jump with squash on land.',
  },
  walk: {
    title: 'Walk cycle (loop)',
    fps: 12,
    frames: [
      { duration: 1, label: 'contact-L', pose: { segments: { '7': { angle_rad: 0.9 }, '8': { angle_rad: 1.5 }, '9': { angle_rad: 2.2 }, '10': { angle_rad: 1.6 }, '3': { angle_rad: 1.6 }, '5': { angle_rad: 1.5 } } } },
      { duration: 1, label: 'down', pose: { segments: { '7': { angle_rad: 1.05 }, '8': { angle_rad: 1.7 }, '9': { angle_rad: 2.0 }, '10': { angle_rad: 1.5 }, '3': { angle_rad: 1.4 }, '5': { angle_rad: 1.7 } } } },
      { duration: 1, label: 'pass', pose: { segments: { '7': { angle_rad: 1.3 }, '8': { angle_rad: 1.55 }, '9': { angle_rad: 1.85 }, '10': { angle_rad: 1.55 }, '3': { angle_rad: 1.2 }, '5': { angle_rad: 1.9 } } } },
      { duration: 1, label: 'up', pose: { segments: { '7': { angle_rad: 1.55 }, '8': { angle_rad: 1.4 }, '9': { angle_rad: 1.7 }, '10': { angle_rad: 1.6 }, '3': { angle_rad: 1.0 }, '5': { angle_rad: 2.1 } } } },
      { duration: 1, label: 'contact-R', pose: { segments: { '7': { angle_rad: 2.2 }, '8': { angle_rad: 1.6 }, '9': { angle_rad: 0.9 }, '10': { angle_rad: 1.5 }, '3': { angle_rad: 1.5 }, '5': { angle_rad: 1.6 } } } },
      { duration: 1, label: 'down2', pose: { segments: { '7': { angle_rad: 2.0 }, '8': { angle_rad: 1.5 }, '9': { angle_rad: 1.05 }, '10': { angle_rad: 1.7 }, '3': { angle_rad: 1.7 }, '5': { angle_rad: 1.4 } } } },
      { duration: 1, label: 'pass2', pose: { segments: { '7': { angle_rad: 1.85 }, '8': { angle_rad: 1.55 }, '9': { angle_rad: 1.3 }, '10': { angle_rad: 1.55 }, '3': { angle_rad: 1.9 }, '5': { angle_rad: 1.2 } } } },
      { duration: 1, label: 'up2', pose: { segments: { '7': { angle_rad: 1.7 }, '8': { angle_rad: 1.6 }, '9': { angle_rad: 1.55 }, '10': { angle_rad: 1.4 }, '3': { angle_rad: 2.1 }, '5': { angle_rad: 1.0 } } } },
    ],
    notes: '8-frame walk loop.',
  },
};

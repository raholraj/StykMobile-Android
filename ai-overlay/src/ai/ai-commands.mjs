/** Apply AI animation plans to live StykAnimate editor (timeline + poses). */

const ANIM_BLOCK = /```styk-animation\s*([\s\S]*?)```/i;

export function extractAnimationBlock(text) {
  if (!text) return null;
  const m = text.match(ANIM_BLOCK);
  if (!m) return null;
  try { return JSON.parse(m[1].trim()); }
  catch (e) { console.warn('Styk AI: invalid animation JSON', e); return null; }
}

function getEditor(explicit) {
  return explicit || globalThis.__stykEditor || globalThis.styk?.editor || null;
}

function cloneFrame(frame) {
  try { return structuredClone(frame); }
  catch { return JSON.parse(JSON.stringify(frame)); }
}

function applyPoseToFrame(frame, pose) {
  if (!frame?.objects?.length || !pose) return frame;
  const obj = frame.objects[0];
  if (!obj) return frame;
  if (typeof pose.root_x === 'number') obj.x = pose.root_x;
  if (typeof pose.root_y === 'number') obj.y = pose.root_y;
  if (typeof pose.x === 'number') obj.x = pose.x;
  if (typeof pose.y === 'number') obj.y = pose.y;
  if (!Array.isArray(obj.angles)) obj.angles = [];
  if (Array.isArray(pose.angles)) {
    for (let i = 0; i < pose.angles.length; i++) {
      if (typeof pose.angles[i] === 'number') obj.angles[i] = pose.angles[i];
    }
  }
  if (pose.segments && typeof pose.segments === 'object') {
    for (const [key, props] of Object.entries(pose.segments)) {
      const idx = Number(key);
      if (!Number.isInteger(idx) || idx < 0) continue;
      const angle = typeof props === 'number' ? props : props?.angle_rad;
      if (typeof angle === 'number') {
        while (obj.angles.length <= idx) obj.angles.push(0);
        obj.angles[idx] = angle;
      }
      if (typeof props === 'object' && typeof props.length === 'number' && Array.isArray(obj.lengths)) {
        while (obj.lengths.length <= idx) obj.lengths.push(obj.lengths[obj.lengths.length - 1] || 40);
        obj.lengths[idx] = props.length;
      }
    }
  }
  return frame;
}

export function applyAnimationPlan(plan, editorArg) {
  const editor = getEditor(editorArg);
  if (!plan?.frames?.length) {
    return { ok: false, message: 'No frames in AI plan.', framesApplied: 0 };
  }
  if (!editor?.report?.keyframes) {
    return {
      ok: false,
      message: 'Editor ready nahi. Pehle "Back to Untitled animation" / Home se animation open karo, phir Apply.',
      framesApplied: 0,
    };
  }

  if (typeof editor.applyAiAnimation === 'function') {
    try {
      const n = editor.applyAiAnimation(plan);
      return { ok: true, message: `Applied ${n} frames: ${plan.title || 'AI'}`, framesApplied: n };
    } catch (e) { console.warn(e); }
  }

  try {
    const baseIndex = editor.frameIndex ?? 0;
    const baseFrame = editor.report.keyframes[baseIndex] || editor.frame;
    if (!baseFrame) {
      return { ok: false, message: 'Koi keyframe nahi. Naya document banao.', framesApplied: 0 };
    }

    const newFrames = plan.frames.map((f) => {
      const frame = cloneFrame(baseFrame);
      if (frame._styk) delete frame._styk.frameId;
      if (typeof f.duration === 'number' && f.duration > 0) {
        frame.duration = f.duration;
        frame.duration_raw = f.duration;
      }
      applyPoseToFrame(frame, f.pose || f);
      return frame;
    });

    if (typeof editor._rangesEdit === 'function') {
      const insertAt = baseIndex + 1;
      editor._rangesEdit(
        `AI: ${plan.title || 'animation'}`,
        [{ index: insertAt, before: [], after: newFrames }],
        { selectIndex: insertAt, structural: true, timing: true },
      );
    } else {
      const insertAt = baseIndex + 1;
      editor.report.keyframes.splice(insertAt, 0, ...newFrames);
      if (typeof editor._invalidate === 'function') editor._invalidate({ timing: true });
      if (typeof editor._emit === 'function') {
        editor._emit('edit', { label: `AI: ${plan.title || 'animation'}`, structural: true, timing: true });
      }
      editor.frameIndex = insertAt;
    }

    try { globalThis.styk?.timeline?.refresh?.(); } catch {}
    try { globalThis.styk?.timeline?.render?.(); } catch {}

    return {
      ok: true,
      message: `✅ ${newFrames.length} frames timeline me add ( ${plan.title || 'AI'} ). Play dabao.`,
      framesApplied: newFrames.length,
    };
  } catch (e) {
    console.error('Styk AI apply failed', e);
    return { ok: false, message: `Apply fail: ${e.message}`, framesApplied: 0 };
  }
}

export const PRESET_ANIMATIONS = {
  wave: {
    title: 'Wave hello', fps: 12,
    frames: [
      { duration: 2, pose: { segments: { '5': { angle_rad: 2.1 }, '6': { angle_rad: 1.8 } } } },
      { duration: 1, pose: { segments: { '5': { angle_rad: 0.3 }, '6': { angle_rad: 0.5 } } } },
      { duration: 1, pose: { segments: { '5': { angle_rad: 0.3 }, '6': { angle_rad: -0.4 } } } },
      { duration: 1, pose: { segments: { '5': { angle_rad: 0.3 }, '6': { angle_rad: 0.6 } } } },
      { duration: 1, pose: { segments: { '5': { angle_rad: 0.3 }, '6': { angle_rad: -0.3 } } } },
      { duration: 2, pose: { segments: { '5': { angle_rad: 2.1 }, '6': { angle_rad: 1.8 } } } },
    ],
    notes: 'Right arm wave.',
  },
  jump: {
    title: 'Jump', fps: 12,
    frames: [
      { duration: 2, pose: { root_y: 0, segments: { '7': { angle_rad: 1.2 }, '8': { angle_rad: 1.55 }, '9': { angle_rad: 1.95 }, '10': { angle_rad: 1.55 } } } },
      { duration: 2, pose: { root_y: 40, segments: { '7': { angle_rad: 0.9 }, '8': { angle_rad: 2.1 }, '9': { angle_rad: 2.2 }, '10': { angle_rad: 1.0 } } } },
      { duration: 1, pose: { root_y: -40, segments: { '7': { angle_rad: 1.4 }, '8': { angle_rad: 1.4 }, '9': { angle_rad: 1.7 }, '10': { angle_rad: 1.4 }, '3': { angle_rad: 0.5 }, '5': { angle_rad: 2.6 } } } },
      { duration: 2, pose: { root_y: -100, segments: { '7': { angle_rad: 1.0 }, '8': { angle_rad: 1.2 }, '9': { angle_rad: 2.1 }, '10': { angle_rad: 1.9 } } } },
      { duration: 1, pose: { root_y: -20, segments: { '7': { angle_rad: 1.15 }, '8': { angle_rad: 1.5 }, '9': { angle_rad: 2.0 }, '10': { angle_rad: 1.5 } } } },
      { duration: 2, pose: { root_y: 40, segments: { '7': { angle_rad: 0.95 }, '8': { angle_rad: 2.0 }, '9': { angle_rad: 2.15 }, '10': { angle_rad: 1.1 } } } },
      { duration: 2, pose: { root_y: 0, segments: { '7': { angle_rad: 1.2 }, '8': { angle_rad: 1.55 }, '9': { angle_rad: 1.95 }, '10': { angle_rad: 1.55 } } } },
    ],
    notes: 'Jump with squash.',
  },
  walk: {
    title: 'Walk cycle', fps: 12,
    frames: [
      { duration: 1, pose: { segments: { '7': { angle_rad: 0.9 }, '8': { angle_rad: 1.5 }, '9': { angle_rad: 2.2 }, '10': { angle_rad: 1.6 }, '3': { angle_rad: 1.6 }, '5': { angle_rad: 1.5 } } } },
      { duration: 1, pose: { segments: { '7': { angle_rad: 1.05 }, '8': { angle_rad: 1.7 }, '9': { angle_rad: 2.0 }, '10': { angle_rad: 1.5 }, '3': { angle_rad: 1.4 }, '5': { angle_rad: 1.7 } } } },
      { duration: 1, pose: { segments: { '7': { angle_rad: 1.3 }, '8': { angle_rad: 1.55 }, '9': { angle_rad: 1.85 }, '10': { angle_rad: 1.55 }, '3': { angle_rad: 1.2 }, '5': { angle_rad: 1.9 } } } },
      { duration: 1, pose: { segments: { '7': { angle_rad: 1.55 }, '8': { angle_rad: 1.4 }, '9': { angle_rad: 1.7 }, '10': { angle_rad: 1.6 }, '3': { angle_rad: 1.0 }, '5': { angle_rad: 2.1 } } } },
      { duration: 1, pose: { segments: { '7': { angle_rad: 2.2 }, '8': { angle_rad: 1.6 }, '9': { angle_rad: 0.9 }, '10': { angle_rad: 1.5 }, '3': { angle_rad: 1.5 }, '5': { angle_rad: 1.6 } } } },
      { duration: 1, pose: { segments: { '7': { angle_rad: 2.0 }, '8': { angle_rad: 1.5 }, '9': { angle_rad: 1.05 }, '10': { angle_rad: 1.7 }, '3': { angle_rad: 1.7 }, '5': { angle_rad: 1.4 } } } },
      { duration: 1, pose: { segments: { '7': { angle_rad: 1.85 }, '8': { angle_rad: 1.55 }, '9': { angle_rad: 1.3 }, '10': { angle_rad: 1.55 }, '3': { angle_rad: 1.9 }, '5': { angle_rad: 1.2 } } } },
      { duration: 1, pose: { segments: { '7': { angle_rad: 1.7 }, '8': { angle_rad: 1.6 }, '9': { angle_rad: 1.55 }, '10': { angle_rad: 1.4 }, '3': { angle_rad: 2.1 }, '5': { angle_rad: 1.0 } } } },
    ],
    notes: '8-frame walk.',
  },
};

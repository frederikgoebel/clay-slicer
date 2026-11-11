import type { BlendMode, TextureLayer, TextureType } from '../../core/types';
import { PRINT_FIELDS as F } from '../../domain/printLabels';
import { BLENDS, FIELDS } from '../../domain/textureFields';
import {
  ALL_AROUND,
  BRIDGE_BACK,
  CLOSE_SLOWLY,
  ONE_SIDE,
  STAY_OPEN,
  TEXTURE_NAMES,
} from '../../domain/print';
import { useId, useState, type DragEvent } from 'react';
import { loadDecalImage, maskImageKey } from '../../actions/decalActions';
import { DEFAULT_PATTERN, PATTERN_KINDS } from '../../core/textures/noise';
import type { MaskPattern, PatternKind } from '../../core/types';
import { useImageStore } from '../../store/imageStore';
import { useMaskStore } from '../../store/maskStore';
import { useSettingsStore } from '../../store/settingsStore';
import { useUiStore } from '../../store/uiStore';
import { Button, Section, Segmented, SelectField, Toggle } from '../ui/controls';
import { TextureThumb } from './TextureThumb';
import { CurveEditor } from '../ui/CurveEditor';
import { RangeSlider } from '../ui/RangeSlider';
import { Slider } from '../ui/Slider';
import styles from './panels.module.css';

const BRUSH_MODES = [
  ['add', 'Paint'],
  ['erase', 'Erase'],
] as const;

function PaintTools({ id }: { id: string }) {
  const paint = useUiStore((s) => s.paint);
  const patchPaint = useUiStore((s) => s.patchPaint);
  const setPaintTexture = useUiStore((s) => s.setPaintTexture);
  const clear = useMaskStore((s) => s.clear);
  const invert = useMaskStore((s) => s.invert);
  return (
    <div className={styles.paintTools}>
      <p className={styles.hint}>
        Drag on the model to paint where this texture applies. Right mouse button rotates the view.
      </p>
      <Segmented
        label="Brush mode"
        value={paint.erase ? 'erase' : 'add'}
        options={BRUSH_MODES}
        onChange={(m) => patchPaint({ erase: m === 'erase' })}
      />
      <Slider
        label="Brush size"
        value={paint.radius}
        min={2}
        max={60}
        step={1}
        unit="mm"
        onChange={(radius) => patchPaint({ radius })}
      />
      <Slider
        label="Hardness"
        value={paint.hardness}
        min={0}
        max={100}
        step={1}
        unit="%"
        hint="Soft brushes fade out toward the edge."
        onChange={(hardness) => patchPaint({ hardness })}
      />
      <Slider
        label="Opacity"
        value={paint.opacity}
        min={5}
        max={100}
        step={1}
        unit="%"
        hint="Like a grayscale brush: a stroke at 40% gives 40% of the texture. Paint over it again to build up."
        onChange={(opacity) => patchPaint({ opacity })}
      />
      <div className={styles.buttonRow}>
        <Button small onClick={() => clear(id)} title="Texture applies everywhere again">
          Everywhere
        </Button>
        <Button small onClick={() => invert(id)}>
          Invert
        </Button>
        <Button small variant="primary" onClick={() => setPaintTexture(null)}>
          Done
        </Button>
      </div>
    </div>
  );
}

interface DragApi {
  start: (e: DragEvent) => void;
  end: () => void;
}

const NOISE_KINDS: PatternKind[] = ['simplex', 'billow', 'ridged'];

/** Where the texture applies: noise, stripes or an image, on top of the painted area. */
function PatternTools({ tex }: { tex: TextureLayer }) {
  const patch = useSettingsStore((s) => s.patchTexture);
  const fileId = useId();
  const imageKey = maskImageKey(tex.id);
  const hasImage = useImageStore((s) => Boolean(s.images[imageKey]));
  const p = tex.maskPattern ?? null;
  const set = (v: Partial<MaskPattern>) =>
    patch(tex.id, { maskPattern: { ...DEFAULT_PATTERN, ...(p ?? {}), ...v } });
  return (
    <>
      <div className={styles.maskRow}>
        <label className={styles.label} htmlFor={`${fileId}-kind`}>
          Mask pattern
        </label>
        <select
          id={`${fileId}-kind`}
          aria-label="Mask pattern"
          value={p?.kind ?? 'none'}
          onChange={(e) =>
            e.target.value === 'none'
              ? patch(tex.id, { maskPattern: null })
              : set({ kind: e.target.value as PatternKind })
          }
        >
          <option value="none">None</option>
          {PATTERN_KINDS.map(([k, name]) => (
            <option key={k} value={k}>
              {name}
            </option>
          ))}
        </select>
      </div>
      {p && p.kind === 'image' && (
        <div className={styles.maskRow}>
          <span className={hasImage ? styles.maskOn : styles.hint}>
            {hasImage ? 'Image loaded (bright = texture)' : 'No image yet'}
          </span>
          <label className={styles.fileBtn} htmlFor={fileId}>
            {hasImage ? 'Replace…' : 'Load image…'}
          </label>
          <input
            id={fileId}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void loadDecalImage(tex.id, file, imageKey);
              e.target.value = '';
            }}
          />
        </div>
      )}
      {p && p.kind === 'image' && (
        <>
          <Slider
            label="Repeats around"
            value={p.tilesU}
            min={1}
            max={20}
            step={1}
            unit="×"
            onChange={(tilesU) => set({ tilesU })}
          />
          <Slider
            label="Repeats in height"
            value={p.tilesV}
            min={1}
            max={20}
            step={1}
            unit="×"
            hint="The picture is wrapped once around the object and over its whole height, then repeated"
            onChange={(tilesV) => set({ tilesV })}
          />
        </>
      )}
      {p && p.kind === 'curvature' && (
        <>
          <div className={styles.maskRow}>
            <label className={styles.label} htmlFor={`${fileId}-where`}>
              Where
            </label>
            <select
              id={`${fileId}-where`}
              aria-label="Curvature where"
              value={p.curvature ?? 'either'}
              onChange={(e) =>
                set({ curvature: e.target.value as 'convex' | 'concave' | 'either' })
              }
            >
              <option value="convex">Outward corners (convex)</option>
              <option value="concave">Inward corners (concave)</option>
              <option value="either">Both</option>
            </select>
          </div>
          <Slider
            label="Corner radius"
            value={p.scale}
            min={2}
            max={200}
            step={1}
            unit="mm"
            hint="Where the outline bends tighter than this radius the texture applies. Use Invert for flatter areas."
            onChange={(scale) => set({ scale })}
          />
          <Slider
            label="Soft edge"
            value={p.softness}
            min={0}
            max={100}
            step={1}
            unit="%"
            onChange={(softness) => set({ softness })}
          />
        </>
      )}
      {p && p.kind !== 'image' && p.kind !== 'curvature' && (
        <>
          {p.kind !== 'gradient' && (
            <Slider
              label="Size"
              value={p.scale}
              min={2}
              max={150}
              step={1}
              unit="mm"
              hint="Size of the features on the surface"
              onChange={(scale) => set({ scale })}
            />
          )}
          {NOISE_KINDS.includes(p.kind) && (
            <Slider
              label="Detail"
              value={p.detail}
              min={1}
              max={6}
              step={1}
              unit="×"
              hint="Layers of finer noise added on top"
              onChange={(detail) => set({ detail })}
            />
          )}
          {p.kind !== 'gradient' && (
            <Slider
              label="Stretch in height"
              value={p.stretch}
              min={0.2}
              max={5}
              step={0.1}
              unit="×"
              hint="1 = same size around and in height; above 1 = taller features"
              onChange={(stretch) => set({ stretch })}
            />
          )}
          {(p.kind === 'stripes' || p.kind === 'checker' || p.kind === 'gradient') && (
            <Slider
              label="Direction"
              value={p.rotate}
              min={-90}
              max={90}
              step={1}
              unit="°"
              hint={
                p.kind === 'gradient'
                  ? '0 = bottom to top · 90 = from one side round to the opposite side · negative = the other way'
                  : '0 = rings around the object (stripes) · 90 = vertical lines'
              }
              onChange={(rotate) => set({ rotate })}
            />
          )}
          <Slider
            label="Warp"
            value={p.warp}
            min={0}
            max={100}
            step={1}
            unit="%"
            hint="Bends the pattern with a second noise, for organic edges"
            onChange={(warp) => set({ warp })}
          />
          <Slider
            label="Coverage"
            value={p.coverage}
            min={0}
            max={100}
            step={1}
            unit="%"
            hint="How much of the surface the texture covers"
            onChange={(coverage) => set({ coverage })}
          />
          <Slider
            label="Soft edge"
            value={p.softness}
            min={0}
            max={100}
            step={1}
            unit="%"
            onChange={(softness) => set({ softness })}
          />
          {p.kind !== 'gradient' && (
            <Slider
              label="Seed"
              value={p.seed}
              min={0}
              max={999}
              step={1}
              onChange={(seed) => set({ seed })}
            />
          )}
        </>
      )}
      {p && (
        <Toggle label="Invert pattern" checked={p.invert} onChange={(invert) => set({ invert })} />
      )}
    </>
  );
}

function TextureCard({ tex, drag }: { tex: TextureLayer; drag: DragApi }) {
  const patch = useSettingsStore((s) => s.patchTexture);
  const remove = useSettingsStore((s) => s.removeTexture);
  const painting = useUiStore((s) => s.paint.textureId === tex.id);
  const setPaintTexture = useUiStore((s) => s.setPaintTexture);
  const hasMask = useMaskStore((s) => Boolean(s.masks[tex.id]));
  const clearMask = useMaskStore((s) => s.clear);
  const move = useSettingsStore((s) => s.moveTexture);
  const collapsed = useUiStore((s) => Boolean(s.collapsedTex[tex.id]));
  const setCollapsed = useUiStore((s) => s.setTexCollapsed);
  const hasImage = useImageStore((s) => Boolean(s.images[tex.id]));
  const fileId = useId();
  const layered = tex.type !== 'twist' && tex.type !== 'blobs';

  return (
    <div className={styles.tex} data-texcard>
      <div className={styles.texHead}>
        <button
          type="button"
          className={styles.grip}
          draggable
          title="Drag to reorder (applied top to bottom). Arrow keys also work."
          aria-label={`Reorder ${TEXTURE_NAMES[tex.type]}`}
          onDragStart={drag.start}
          onDragEnd={drag.end}
          onKeyDown={(e) => {
            if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
              e.preventDefault();
              move(tex.id, e.key === 'ArrowUp' ? -1 : 1);
            }
          }}
        >
          ⠿
        </button>
        <button
          type="button"
          className={styles.chevron}
          aria-expanded={!collapsed}
          aria-label={collapsed ? 'Expand texture' : 'Collapse texture'}
          title={collapsed ? 'Expand' : 'Collapse'}
          onClick={() => {
            if (!collapsed && painting) setPaintTexture(null);
            setCollapsed(tex.id, !collapsed);
          }}
        >
          {collapsed ? '▸' : '▾'}
        </button>
        <TextureThumb tex={tex} />
        <input
          type="checkbox"
          aria-label={`Enable ${TEXTURE_NAMES[tex.type]}`}
          checked={tex.enabled}
          onChange={(e) => patch(tex.id, { enabled: e.target.checked })}
        />
        <strong>{TEXTURE_NAMES[tex.type]}</strong>
        <button
          type="button"
          className={styles.x}
          title="Remove texture"
          aria-label="Remove texture"
          onClick={() => {
            if (painting) setPaintTexture(null);
            clearMask(tex.id);
            remove(tex.id);
          }}
        >
          ×
        </button>
      </div>
      {!collapsed && (
        <>
          {tex.type === 'decal' && (
            <div className={styles.maskRow}>
              <span className={hasImage ? styles.maskOn : styles.hint}>
                {hasImage ? 'Image loaded' : 'No image yet'}
              </span>
              <label className={styles.fileBtn} htmlFor={fileId}>
                {hasImage ? 'Replace…' : 'Load image…'}
              </label>
              <input
                id={fileId}
                type="file"
                accept="image/*"
                hidden
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void loadDecalImage(tex.id, file);
                  e.target.value = '';
                }}
              />
            </div>
          )}
          {tex.type !== 'decal' && (
            <RangeSlider
              value={{ from: tex.from, solidFrom: tex.solidFrom, solid: tex.solid, to: tex.to }}
              onChange={(r) => patch(tex.id, r)}
            />
          )}
          {FIELDS[tex.type].map((f) => (
            <Slider
              key={f.key}
              label={f.label}
              value={tex[f.key] ?? 0}
              hint={f.hint}
              min={f.min}
              max={f.max}
              step={f.step}
              unit={f.unit}
              onChange={(v) => patch(tex.id, { [f.key]: v })}
            />
          ))}
          {tex.type === 'ledge' && (
            <>
              <CurveEditor
                label="Outdent over height"
                xLabel="height in range"
                yLabel="outdent"
                points={tex.curveV ?? CLOSE_SLOWLY}
                presets={[
                  ['Close slowly', CLOSE_SLOWLY],
                  ['Bridge back', BRIDGE_BACK],
                  ['Stay open', STAY_OPEN],
                ]}
                onChange={(curveV) => patch(tex.id, { curveV })}
              />
              <CurveEditor
                label="Outdent around"
                xLabel="angle around"
                yLabel="outdent"
                points={tex.curveA ?? ALL_AROUND}
                presets={[
                  ['All around', ALL_AROUND],
                  ['One side', ONE_SIDE],
                ]}
                onChange={(curveA) => patch(tex.id, { curveA })}
              />
            </>
          )}
          {tex.type === 'decal' && (
            <>
              <Toggle
                label="Invert (bright = engraved)"
                checked={tex.invert}
                onChange={(invert) => patch(tex.id, { invert })}
              />
              <div className={styles.maskRow}>
                <span className={styles.hint}>Click or drag on the model to place it</span>
                <Button
                  small
                  variant={painting ? 'primary' : 'default'}
                  onClick={() => setPaintTexture(painting ? null : tex.id)}
                >
                  {painting ? 'Placing…' : 'Place on model'}
                </Button>
              </div>
            </>
          )}
          {layered && (
            <SelectField
              label="Blend"
              value={tex.blend}
              options={BLENDS}
              onChange={(blend: BlendMode) => patch(tex.id, { blend })}
            />
          )}
          {tex.type !== 'twist' && tex.type !== 'decal' && (
            <div className={styles.maskRow}>
              <span className={hasMask ? styles.maskOn : styles.hint}>
                {hasMask ? 'Painted area only' : 'Applies everywhere'}
              </span>
              <Button
                small
                variant={painting ? 'primary' : 'default'}
                onClick={() => setPaintTexture(painting ? null : tex.id)}
              >
                {painting ? 'Painting…' : 'Paint mask'}
              </Button>
            </div>
          )}
          {painting && tex.type !== 'decal' && <PaintTools id={tex.id} />}
          {tex.type !== 'twist' && tex.type !== 'decal' && <PatternTools tex={tex} />}
        </>
      )}
    </div>
  );
}

export function TexturesPanel() {
  const textures = useSettingsStore((s) => s.textures);
  const addTexture = useSettingsStore((s) => s.addTexture);
  const print = useSettingsStore((s) => s.print);
  const setPrint = useSettingsStore((s) => s.setPrint);
  const moveTo = useSettingsStore((s) => s.moveTextureTo);
  const [dragId, setDragId] = useState<string | null>(null);
  /** insertion position (0..length) shown while dragging */
  const [drop, setDrop] = useState<number | null>(null);
  const stopDrag = () => {
    setDragId(null);
    setDrop(null);
  };
  const over = (i: number) => (e: DragEvent) => {
    if (!dragId) return;
    e.preventDefault();
    const box = e.currentTarget.getBoundingClientRect();
    setDrop(e.clientY > box.top + box.height / 2 ? i + 1 : i);
  };
  const dropHere = (e: DragEvent) => {
    e.preventDefault();
    const from = textures.findIndex((x) => x.id === dragId);
    if (dragId && drop !== null && from >= 0) moveTo(dragId, drop > from ? drop - 1 : drop);
    stopDrag();
  };
  return (
    <Section title="Textures" defaultOpen>
      <Slider
        label={F.textureFadeIn.label}
        value={print.textureFadeIn}
        min={0}
        max={30}
        step={0.5}
        unit="mm"
        hint="Textures grow in over this height above the floor"
        onChange={(textureFadeIn) => setPrint({ textureFadeIn })}
      />
      <div className={styles.textures}>
        {textures.length === 0 && <p className={styles.hint}>No textures yet. Add one below.</p>}
        {textures.map((t, i) => (
          <div
            key={t.id}
            className={[
              styles.texSlot,
              t.id === dragId ? styles.dragging : '',
              drop === i ? styles.dropBefore : '',
              drop === textures.length && i === textures.length - 1 ? styles.dropAfter : '',
            ].join(' ')}
            onDragOver={over(i)}
            onDrop={dropHere}
          >
            <TextureCard
              tex={t}
              drag={{
                start: (e) => {
                  e.dataTransfer.effectAllowed = 'move';
                  e.dataTransfer.setData('text/plain', t.id);
                  const card = e.currentTarget.closest('[data-texcard]');
                  if (card) e.dataTransfer.setDragImage(card, 12, 12);
                  // after the browser has taken its drag snapshot, or some browsers cancel the drag
                  setTimeout(() => setDragId(t.id), 0);
                },
                end: stopDrag,
              }}
            />
          </div>
        ))}
      </div>
      <select
        aria-label="Add texture"
        value=""
        onChange={(e) => {
          if (e.target.value) addTexture(e.target.value as TextureType);
        }}
      >
        <option value="">+ Add texture…</option>
        {(Object.keys(TEXTURE_NAMES) as TextureType[]).map((k) => (
          <option key={k} value={k}>
            {TEXTURE_NAMES[k]}
          </option>
        ))}
      </select>
    </Section>
  );
}

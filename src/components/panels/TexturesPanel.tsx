import type { BlendMode, TextureLayer, TextureType } from '../../core/types';
import { TEXTURE_NAMES } from '../../domain/print';
import { useId } from 'react';
import { loadDecalImage } from '../../actions/decalActions';
import { useImageStore } from '../../store/imageStore';
import { useMaskStore } from '../../store/maskStore';
import { useSettingsStore } from '../../store/settingsStore';
import { useUiStore } from '../../store/uiStore';
import { Button, Section, Segmented, SelectField, Toggle } from '../ui/controls';
import { RangeSlider } from '../ui/RangeSlider';
import { Slider } from '../ui/Slider';
import styles from './panels.module.css';

interface TexField {
  key: 'amplitude' | 'count' | 'wavelength' | 'seed' | 'angle' | 'zc' | 'width' | 'hgt' | 'rot';
  label: string;
  min: number;
  max: number;
  step: number;
  unit?: string;
}

const WAVE: TexField[] = [
  { key: 'amplitude', label: 'Amplitude', min: 0, max: 12, step: 0.1, unit: 'mm' },
  { key: 'count', label: 'Around', min: 0, max: 60, step: 1, unit: '×' },
  { key: 'wavelength', label: 'Vertical λ', min: 0, max: 120, step: 1, unit: 'mm' },
];

const FIELDS: Record<TextureType, TexField[]> = {
  fuzzy: [
    { key: 'amplitude', label: 'Strength', min: 0, max: 3, step: 0.05, unit: 'mm' },
    { key: 'wavelength', label: 'Feature size', min: 0.5, max: 30, step: 0.5, unit: 'mm' },
    { key: 'seed', label: 'Seed', min: 1, max: 99, step: 1 },
  ],
  wave: WAVE,
  zigzag: WAVE,
  ribs: [
    { key: 'amplitude', label: 'Depth', min: 0, max: 8, step: 0.1, unit: 'mm' },
    { key: 'count', label: 'Ribs', min: 1, max: 80, step: 1, unit: '×' },
  ],
  blobs: [
    { key: 'amplitude', label: 'Dwell per blob', min: 0.1, max: 10, step: 0.1, unit: 's' },
    { key: 'count', label: 'Blobs per row', min: 1, max: 60, step: 1, unit: '×' },
    { key: 'wavelength', label: 'Row spacing', min: 0, max: 60, step: 1, unit: 'mm' },
  ],
  decal: [
    { key: 'amplitude', label: 'Relief', min: -6, max: 6, step: 0.1, unit: 'mm' },
    { key: 'angle', label: 'Around (centre)', min: -180, max: 180, step: 1, unit: '°' },
    { key: 'zc', label: 'Height (centre)', min: 0, max: 400, step: 1, unit: 'mm' },
    { key: 'width', label: 'Width', min: 5, max: 400, step: 1, unit: 'mm' },
    { key: 'hgt', label: 'Height', min: 5, max: 400, step: 1, unit: 'mm' },
    { key: 'rot', label: 'Rotation', min: -180, max: 180, step: 1, unit: '°' },
  ],
  twist: [{ key: 'amplitude', label: 'Total twist', min: -720, max: 720, step: 5, unit: '°' }],
};

const BLENDS: readonly (readonly [BlendMode, string])[] = [
  ['add', 'Add (sum with layers above)'],
  ['max', 'Max (higher one wins)'],
  ['replace', 'Replace (overrides layers above)'],
];

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

function TextureCard({ tex }: { tex: TextureLayer }) {
  const patch = useSettingsStore((s) => s.patchTexture);
  const remove = useSettingsStore((s) => s.removeTexture);
  const painting = useUiStore((s) => s.paint.textureId === tex.id);
  const setPaintTexture = useUiStore((s) => s.setPaintTexture);
  const hasMask = useMaskStore((s) => Boolean(s.masks[tex.id]));
  const clearMask = useMaskStore((s) => s.clear);
  const move = useSettingsStore((s) => s.moveTexture);
  const hasImage = useImageStore((s) => Boolean(s.images[tex.id]));
  const removeImage = useImageStore((s) => s.remove);
  const fileId = useId();
  const layered = tex.type !== 'twist' && tex.type !== 'blobs';

  return (
    <div className={styles.tex}>
      <div className={styles.texHead}>
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
          title="Move up (applied earlier)"
          aria-label="Move texture up"
          onClick={() => move(tex.id, -1)}
        >
          ↑
        </button>
        <button
          type="button"
          className={styles.x}
          title="Move down (applied later)"
          aria-label="Move texture down"
          onClick={() => move(tex.id, 1)}
        >
          ↓
        </button>
        <button
          type="button"
          className={styles.x}
          title="Remove texture"
          aria-label="Remove texture"
          onClick={() => {
            if (painting) setPaintTexture(null);
            clearMask(tex.id);
            removeImage(tex.id);
            remove(tex.id);
          }}
        >
          ×
        </button>
      </div>
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
          value={{ from: tex.from, solid: tex.solid, to: tex.to }}
          onChange={(r) => patch(tex.id, r)}
        />
      )}
      {FIELDS[tex.type].map((f) => (
        <Slider
          key={f.key}
          label={f.label}
          value={tex[f.key]}
          min={f.min}
          max={f.max}
          step={f.step}
          unit={f.unit}
          onChange={(v) => patch(tex.id, { [f.key]: v })}
        />
      ))}
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
    </div>
  );
}

export function TexturesPanel() {
  const textures = useSettingsStore((s) => s.textures);
  const addTexture = useSettingsStore((s) => s.addTexture);
  const print = useSettingsStore((s) => s.print);
  const setPrint = useSettingsStore((s) => s.setPrint);
  return (
    <Section title="Textures" defaultOpen>
      <Slider
        label="Fade-in above floor"
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
        {textures.map((t) => (
          <TextureCard key={t.id} tex={t} />
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

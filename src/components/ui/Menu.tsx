import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import styles from './menu.module.css';

export interface MenuItem {
  label: string;
  onSelect: () => void;
  title?: string;
  /** red, for things that delete */
  danger?: boolean;
}

/** A small "..." button that opens a list of actions. Closes on Esc, a click elsewhere or a scroll. */
export function MenuButton({ items, label }: { items: MenuItem[]; label: string }) {
  const btn = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (!pos) return;
    const close = () => setPos(null);
    const key = (e: KeyboardEvent) => e.key === 'Escape' && close();
    const down = (e: PointerEvent) => {
      if (!(e.target as Element).closest(`.${styles.menu}`) && e.target !== btn.current) close();
    };
    window.addEventListener('keydown', key);
    window.addEventListener('pointerdown', down);
    window.addEventListener('resize', close);
    window.addEventListener('scroll', close, true);
    return () => {
      window.removeEventListener('keydown', key);
      window.removeEventListener('pointerdown', down);
      window.removeEventListener('resize', close);
      window.removeEventListener('scroll', close, true);
    };
  }, [pos]);

  return (
    <>
      <button
        ref={btn}
        type="button"
        className={styles.dots}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={pos !== null}
        title={label}
        onClick={(e) => {
          e.stopPropagation();
          if (pos) return setPos(null);
          const r = e.currentTarget.getBoundingClientRect();
          setPos({ x: r.right, y: r.bottom + 4 });
        }}
      >
        ⋯
      </button>
      {pos &&
        createPortal(
          <ul
            className={styles.menu}
            role="menu"
            style={{ top: pos.y, right: window.innerWidth - pos.x }}
          >
            {items.map((it) => (
              <li key={it.label} role="none">
                <button
                  type="button"
                  role="menuitem"
                  title={it.title}
                  className={it.danger ? styles.danger : undefined}
                  onClick={() => {
                    setPos(null);
                    it.onSelect();
                  }}
                >
                  {it.label}
                </button>
              </li>
            ))}
          </ul>,
          document.body,
        )}
    </>
  );
}

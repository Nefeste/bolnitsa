// Подпись под курсором (spec docs/specs/2026-10-aaa-polish.md, «Выделение и наведение»): у человека — кто он и что
// делает, у помещения — название и состояние. Один элемент DOM поверх 3D-вида, под панелями, как значки помещений
// (chips.ts): слова меняются, когда меняется то, что под курсором, место — каждый кадр, рядом с курсором.
export class HoverLabel {
  private el: HTMLDivElement;
  private title = document.createElement('b');
  private sub = document.createElement('span');
  private key = '';
  /** сдвиг от курсора, точек */
  private static readonly DX = 16;
  private static readonly DY = 20;

  constructor() {
    this.el = document.createElement('div');
    this.el.className = 'hoverlabel';
    this.el.id = 'hover';
    this.el.style.display = 'none';
    this.el.append(this.title, this.sub);
    document.body.insertBefore(this.el, document.getElementById('ui'));
  }

  /** Что подписать: заголовок и строка состояния; ничего — подпись прячется. */
  set(title?: string, sub?: string) {
    const key = title ? `${title}|${sub ?? ''}` : '';
    if (key === this.key) return;
    this.key = key;
    if (!title) {
      this.el.style.display = 'none';
      return;
    }
    this.title.textContent = title;
    this.sub.textContent = sub ?? '';
    this.sub.style.display = sub ? 'block' : 'none';
    this.el.style.display = 'block';
  }

  /** Каждый кадр: у курсора, правее и ниже; у правого и нижнего края окна — по другую сторону, чтобы не обрезалась. */
  frame(x: number, y: number) {
    if (!this.key) return;
    const w = this.el.offsetWidth;
    const h = this.el.offsetHeight;
    const left = x + HoverLabel.DX + w > window.innerWidth - 8 ? x - HoverLabel.DX - w : x + HoverLabel.DX;
    const top = y + HoverLabel.DY + h > window.innerHeight - 8 ? y - HoverLabel.DY - h : y + HoverLabel.DY;
    this.el.style.transform = `translate(${Math.max(8, left)}px, ${Math.max(8, top)}px)`;
  }

  /** Текст подписи — для сценария в браузере. */
  get text(): string {
    return this.key ? `${this.title.textContent}${this.sub.textContent ? ` · ${this.sub.textContent}` : ''}` : '';
  }
}

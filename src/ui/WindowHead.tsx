// Строка заголовка окна (spec docs/specs/2026-10-clinical-style.md, часть 2): значок, название, кнопки окна и «Закрыть» —
// одна во всех окнах поверх карты. Значок — Carbon (решение владельца #139): у окна, которое открывает кнопка, — её значок,
// у прочих — по смыслу окна. «Закрыть» делает то же, что Esc; у окон, которые закрываются выбором («Сценарий пройден»,
// «Итог», «Что это?»), и у планёрки с её «Продолжить» крестика нет.
import type { ReactNode } from 'react';
import { T } from '../i18n';
import { Icon, type IconName } from './icons';

export interface WindowClose {
  id?: string;
  /** подсказка над крестиком: клавиша и что будет */
  hint: string;
  onClick: () => void;
}

interface P {
  icon: IconName;
  /** номер названия — по нему окно называет себя (aria-labelledby) */
  titleId?: string;
  /** название: строка или имя с подробностями (карта пациента) */
  children: ReactNode;
  /** свои кнопки окна — между названием и «Закрыть» */
  tools?: ReactNode;
  close?: WindowClose;
}

export function WindowHead({ icon, titleId, children, tools, close }: P) {
  return (
    <div className="whead">
      <Icon name={icon} />
      <h2 className="wtitle" id={titleId}>
        {children}
      </h2>
      {tools}
      {close ? (
        <button type="button" className="close" id={close.id} title={close.hint} aria-label={T.app.close} onClick={close.onClick}>
          <Icon name="close" />
        </button>
      ) : null}
    </div>
  );
}

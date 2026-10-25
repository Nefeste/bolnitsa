# Шрифты-кандидаты и их лицензии — из google/fonts (первоисточник Google Fonts), в files/<семейство>/: METADATA.pb,
# прямое начертание (вариативное, если есть), курсив, OFL.txt. Запуск: python3 -I fetch.py
import pathlib, re, urllib.parse, urllib.request

BASE = 'https://raw.githubusercontent.com/google/fonts/main/ofl/'
HERE = pathlib.Path(__file__).resolve().parent
# проверенные семейства: интерфейсные гротески с кириллицей и Unbounded — для заголовков; Onest — шрифт студии, для сравнения
FAMILIES = ['ibmplexsans', 'golostext', 'manrope', 'inter', 'sourcesans3', 'firasans', 'rubik', 'geologica',
            'commissioner', 'wixmadefortext', 'onest', 'unbounded']


def get(url: str) -> bytes:
    return urllib.request.urlopen(url, timeout=60).read()


for fam in FAMILIES:
    d = HERE / 'files' / fam
    d.mkdir(parents=True, exist_ok=True)
    meta = get(BASE + fam + '/METADATA.pb')
    (d / 'METADATA.pb').write_bytes(meta)
    files = re.findall(r'filename: "([^"]+)"', meta.decode())
    var = [x for x in files if '[' in x]
    pick = var or [x for x in files if re.search(r'-(Regular|Italic|Medium|SemiBold|Bold)\.ttf$', x)]
    for name in pick + ['OFL.txt']:
        if (d / name).exists():
            continue
        (d / name).write_bytes(get(BASE + fam + '/' + urllib.parse.quote(name)))
    print(fam, ', '.join(pick))

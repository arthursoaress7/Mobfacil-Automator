#!/usr/bin/env python3
"""Prepara o PR de release (development -> main).

Uso (na raiz do repositório, com a development em HEAD e a main em origin/main):
    python3 .github/scripts/preparar_release.py

O que faz:
  1. Lê a versão atual no @version da main (origin/main).
  2. Lê os commits da development que ainda não estão na main.
  3. Calcula o incremento SemVer pelos tipos (Conventional Commits):
       BREAKING CHANGE / tipo! -> MAJOR · feat -> MINOR · fix, perf -> PATCH · outros -> nenhum
  4. Com incremento: atualiza o @version, o valor reserva de VERSAO e os locais da
     documentação listados no item 12 do instructions.md, e acrescenta a entrada no CHANGELOG.md.
  5. Escreve as saídas em $GITHUB_OUTPUT (ou na tela): versao, incremento, titulo e o
     corpo do PR em /tmp/release_corpo.md.

Falha (código 1) se algum local de versão não for encontrado: a documentação nunca pode
divergir do @version sem que alguém perceba.
"""
import datetime
import os
import re
import subprocess
import sys

SCRIPT = 'paymobifin-assistente.user.js'

# (arquivo, expressão com um grupo para a versão)  — item 12 do instructions.md
LOCAIS = [
    (SCRIPT, r'(?m)^(// @version\s+)(\d+\.\d+(?:\.\d+)?)$'),
    (SCRIPT, r"(GM_info\.script\.version\) \|\| ')(\d+\.\d+(?:\.\d+)?)(')"),
    ('README.md', r'(\*\*Versão atual:\*\* )(\d+\.\d+(?:\.\d+)?)'),
    ('instructions.md', r'(\*\*Versão atual:\*\* )(\d+\.\d+(?:\.\d+)?)'),
    ('CLAUDE.md', r'(\| Versão atual \| )(\d+\.\d+(?:\.\d+)?)( \|)'),
    ('docs/script/01-visao-geral.md', r'(\*\*Versão atual:\*\* )(\d+\.\d+(?:\.\d+)?)'),
    ('docs/script/03-painel-interface.md', r'(PaymobiFin - Assistente  v)(\d+\.\d+(?:\.\d+)?)( )'),
]

# commits do próprio fluxo, que não entram no cálculo nem no CHANGELOG
IGNORAR = re.compile(r'^(chore: release v|chore: sincroniza main na development|chore: integrar development na main|chore: versão \d)', re.I)
TIPO = re.compile(r'^(\w+)(\([^)]*\))?(!)?: ')


def git(*args):
    return subprocess.run(['git', *args], check=True, capture_output=True, text=True).stdout


def versao_da_main():
    texto = git('show', 'origin/main:' + SCRIPT)
    m = re.search(LOCAIS[0][1], texto)
    if not m:
        sys.exit('ERRO: @version não encontrado na main')
    partes = [int(x) for x in m.group(2).split('.')] + [0, 0]
    return partes[:3]


def commits_novos():
    bruto = git('log', 'origin/main..HEAD', '--no-merges', '--format=%s%x1f%h%x1f%b%x1e')
    lista = []
    for bloco in bruto.split('\x1e'):
        bloco = bloco.strip('\n')
        if not bloco:
            continue
        assunto, curto, corpo = (bloco.split('\x1f') + ['', ''])[:3]
        if IGNORAR.match(assunto):
            continue
        lista.append({'assunto': assunto.strip(), 'hash': curto.strip(), 'corpo': corpo})
    return lista


def incremento(commits):
    nivel = 'nenhum'
    for c in commits:
        m = TIPO.match(c['assunto'])
        tipo = m.group(1).lower() if m else ''
        quebra = bool(m and m.group(3)) or 'BREAKING CHANGE' in c['corpo']
        if quebra:
            return 'major'
        if tipo == 'feat':
            nivel = 'minor'
        elif tipo in ('fix', 'perf') and nivel == 'nenhum':
            nivel = 'patch'
    return nivel


def proxima(v, inc):
    major, minor, patch = v
    if inc == 'major':
        return [major + 1, 0, 0]
    if inc == 'minor':
        return [major, minor + 1, 0]
    if inc == 'patch':
        return [major, minor, patch + 1]
    return v


def atualizar_versao(nova):
    for arquivo, expr in LOCAIS:
        with open(arquivo, encoding='utf-8', newline='') as f:
            texto = f.read()
        novo, n = re.subn(expr, lambda m: m.group(1) + nova + (m.group(3) if m.lastindex and m.lastindex >= 3 else ''), texto, count=1)
        if n != 1:
            sys.exit(f'ERRO: local de versão não encontrado em {arquivo} ({expr})')
        with open(arquivo, 'w', encoding='utf-8', newline='') as f:
            f.write(novo)


def secoes(commits):
    grupos = {'quebra': [], 'feat': [], 'fix': [], 'outros': []}
    for c in commits:
        m = TIPO.match(c['assunto'])
        tipo = m.group(1).lower() if m else ''
        linha = f"- {c['assunto']} ({c['hash']})"
        if (m and m.group(3)) or 'BREAKING CHANGE' in c['corpo']:
            grupos['quebra'].append(linha)
        elif tipo == 'feat':
            grupos['feat'].append(linha)
        elif tipo in ('fix', 'perf'):
            grupos['fix'].append(linha)
        else:
            grupos['outros'].append(linha)
    partes = []
    for chave, titulo in (('quebra', '### ⚠️ Mudanças incompatíveis'), ('feat', '### ✨ Novas funcionalidades'),
                          ('fix', '### 🐛 Correções'), ('outros', '### 🔧 Outros')):
        if grupos[chave]:
            partes.append(titulo + '\n\n' + '\n'.join(grupos[chave]))
    return '\n\n'.join(partes)


def atualizar_changelog(nova, commits):
    hoje = datetime.date.today().isoformat()
    entrada = f'## [v{nova}] — {hoje}\n\n' + secoes(commits) + '\n'
    try:
        with open('CHANGELOG.md', encoding='utf-8') as f:
            atual = f.read()
    except FileNotFoundError:
        atual = '# Changelog\n'
    cabecalho, _, resto = atual.partition('\n')
    with open('CHANGELOG.md', 'w', encoding='utf-8') as f:
        f.write(cabecalho + '\n\n' + entrada + '\n' + resto.lstrip('\n'))
    return entrada


def saida(chave, valor):
    destino = os.environ.get('GITHUB_OUTPUT')
    if destino:
        with open(destino, 'a', encoding='utf-8') as f:
            f.write(f'{chave}={valor}\n')
    else:
        print(f'{chave}={valor}')


def main():
    atual = versao_da_main()
    commits = commits_novos()
    inc = incremento(commits)
    nova_lista = proxima(atual, inc)
    nova = '.'.join(str(x) for x in nova_lista)
    atual_txt = '.'.join(str(x) for x in atual)

    if inc != 'nenhum':
        atualizar_versao(nova)
        entrada = atualizar_changelog(nova, commits)
        titulo = f'chore: release v{nova}'
    else:
        entrada = secoes(commits) or '(sem commits novos)'
        titulo = 'chore: integrar development na main'

    corpo = [
        '## PR de release (gerado automaticamente)',
        '',
        f'**Versão:** {atual_txt} → **{nova}** ({inc})' if inc != 'nenhum' else f'**Versão:** {atual_txt} (sem mudança: só docs/chore/ci/refactor/test)',
        '',
        'Ao integrar este PR, o Tampermonkey de **toda a equipe** recebe a versão nova.' if inc != 'nenhum'
        else 'Sem mudança de versão: o Tampermonkey não atualiza.',
        '',
        '### Conteúdo',
        '',
        entrada.strip(),
        '',
        '### Antes de integrar',
        '',
        '- [ ] As mudanças foram testadas na `development`',
        '- [ ] A verificação "Validar alterações" passou',
        '',
        'Este PR é atualizado sozinho a cada merge na `development`. **Não** é integrado automaticamente: o merge na `main` é feito pelo responsável.',
    ]
    with open('/tmp/release_corpo.md', 'w', encoding='utf-8') as f:
        f.write('\n'.join(corpo) + '\n')

    saida('versao', nova)
    saida('versao_atual', atual_txt)
    saida('incremento', inc)
    saida('titulo', titulo)
    saida('commits', str(len(commits)))


if __name__ == '__main__':
    main()

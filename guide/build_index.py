#!/usr/bin/env python3
"""index.template.html + assets/icons.svg -> index.html (the icon sprite is inlined so the page also works from file://)."""
import os
h = os.path.dirname(os.path.abspath(__file__))
t = open(os.path.join(h, 'index.template.html'), encoding='utf-8').read()
s = open(os.path.join(h, 'assets', 'icons.svg'), encoding='utf-8').read().strip()
open(os.path.join(h, 'index.html'), 'w', encoding='utf-8').write(t.replace('<!--ICONS-->', s)); print('index.html written')

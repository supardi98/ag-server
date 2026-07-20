import re
with open('/home/supardi/Projects/supardi.net/ag-server/frontend/src/views/DashboardView.vue', 'r') as f:
    text = f.read()

template_match = re.search(r'<template>', text)
end_template_match = re.search(r'</template>\s*<style', text)
html = text[template_match.end():end_template_match.start()]
start_line = text[:template_match.start()].count('\n') + 2

tags = []
for match in re.finditer(r'<(/?)([a-zA-Z0-9-]+)([^>]*)>', html):
    line_number = html.count('\n', 0, match.start()) + start_line
    tags.append((match.group(1), match.group(2).lower(), match.group(3), line_number))

stack = []
void = {'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr'}

for slash, name, attrs, line in tags:
    if name == 'component': continue
    is_self = attrs.strip().endswith('/') or name in void
    if slash == '/':
        if not stack:
            print(f"Error: stray </{name}> at line {line}")
            break
        top = stack.pop()
        if top[0] != name:
            print(f"Error: expected </{top[0]}> (from line {top[1]}) but got </{name}> at line {line}")
            break
    elif not is_self:
        stack.append((name, line))

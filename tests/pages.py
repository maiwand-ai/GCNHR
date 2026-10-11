"""Validate page wiring without network access or submitting personal data."""
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlsplit, unquote
import json, os
os.chdir(Path(__file__).resolve().parent.parent)
class Page(HTMLParser):
    def __init__(self):
        super().__init__(); self.ids=[]; self.links=[]; self.keys=[]; self.fields={}; self.stack=[]; self.forms=[]
    def handle_starttag(self,tag,attrs):
        data=dict(attrs)
        if 'id' in data: self.ids.append(data['id'])
        if 'data-i18n' in data: self.keys.append(data['data-i18n'])
        if tag in ('a','link','script','img'):
            value=data.get('href') if tag in ('a','link') else data.get('src')
            if value: self.links.append(value)
        if tag in ('input','textarea','select') and 'name' in data: self.fields[data['name']]=data
        if tag=='form': self.forms.append(data)
        if tag=='span': assert not self.stack or self.stack[-1]!='option', 'Invalid span inside option'
        if tag not in ('img','input','link','meta','br','hr','use'): self.stack.append(tag)
    def handle_endtag(self,tag):
        if tag in self.stack:
            self.stack=self.stack[:len(self.stack)-1-self.stack[::-1].index(tag)]
pages={}
for path in list(Path('.').glob('*.html'))+[Path('admin/index.html')]:
    page=Page(); page.feed(path.read_text()); pages[str(path)]=page
content=json.loads(Path('content/content.js').read_text().split('window.SITE_CONTENT =',1)[1].strip().rstrip(';'))
for name,page in pages.items():
    assert len(page.ids)==len(set(page.ids)), f'Duplicate IDs: {name}'
    for key in page.keys: assert key in content['text']['en'], f'Missing text {name}: {key}'
    for link in page.links:
        url=urlsplit(link)
        if url.scheme or url.netloc: continue
        target=Path(name).parent/unquote(url.path) if url.path else Path(name)
        assert target.exists(), f'Missing file {name}: {link}'
        if url.fragment and str(target) in pages: assert url.fragment in pages[str(target)].ids, f'Missing anchor {name}: {link}'
membership=pages['membership.html']
for field in ('name','email','country','message','statutesAgreement','consent'):
    assert 'required' in membership.fields[field], f'Missing required membership field {field}'
assert {'category','organisation'}.issubset(membership.fields)
assert membership.fields['email']['type']=='email'
assert membership.forms[0]['method']=='post'
assert 'panel-features' in pages['admin/index.html'].ids
for key in ('applicationEndpoint','newsletterEndpoint','donationUrl','memberPortalUrl','membershipFee'):
    assert content['settings'][key]=='', f'Unexpected non-placeholder service: {key}'
assert all(not items for items in content['collections'].values()), 'Unexpected invented public content'
print(f'Passed {len(pages)} page checks: assets, links, anchors, IDs, text keys, membership fields, consent and service placeholders.')

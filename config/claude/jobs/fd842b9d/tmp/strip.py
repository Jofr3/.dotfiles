import sys, re
def strip(src):
    out=[]; i=0; n=len(src); state='code'
    while i<n:
        c=src[i]
        if state=='code':
            if src.startswith('//',i):
                j=src.find('\n',i)
                if j==-1: j=n
                out.append(' '*(j-i)); i=j
            elif src.startswith('/*',i):
                j=src.find('*/',i+2)
                if j==-1: j=n
                else: j+=2
                seg=src[i:j]
                out.append(''.join(ch if ch=='\n' else ' ' for ch in seg)); i=j
            elif c in '"\'`':
                q=c; out.append(c); i+=1
                while i<n:
                    if src[i]=='\\': out.append('  '); i+=2; continue
                    if src[i]==q: out.append(q); i+=1; break
                    out.append(src[i] if src[i]!='\n' else '\n'); i+=1
            else:
                out.append(c); i+=1
    return ''.join(out)
src=open(sys.argv[1]).read()
s=strip(src)
pat=re.compile(sys.argv[2])
for idx,line in enumerate(s.split('\n'),1):
    if pat.search(line):
        print(f"{sys.argv[1]}:{idx}: {src.split(chr(10))[idx-1].rstrip()}")

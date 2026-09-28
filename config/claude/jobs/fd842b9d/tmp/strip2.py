import sys
def strip(src):
    out=[]; i=0; n=len(src)
    while i<n:
        c=src[i]
        if src.startswith('//',i):
            j=src.find('\n',i)
            if j==-1: j=n
            out.append(' '*(j-i)); i=j
        elif src.startswith('/*',i):
            j=src.find('*/',i+2)
            j = n if j==-1 else j+2
            out.append(''.join(ch if ch=='\n' else ' ' for ch in src[i:j])); i=j
        elif c in '"\'`':
            q=c; out.append(c); i+=1
            while i<n:
                if src[i]=='\\': out.append('  '); i+=2; continue
                if src[i]==q: out.append(q); i+=1; break
                out.append(src[i]); i+=1
        else:
            out.append(c); i+=1
    return ''.join(out)
sys.stdout.write(strip(open(sys.argv[1]).read()))

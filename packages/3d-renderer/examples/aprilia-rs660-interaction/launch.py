import errno
import http.server
import os
import webbrowser

os.chdir(os.path.dirname(os.path.abspath(__file__)))
try:
    server = http.server.ThreadingHTTPServer(('127.0.0.1', 8785), http.server.SimpleHTTPRequestHandler)
except OSError as exc:
    if exc.errno != errno.EADDRINUSE:
        raise
    server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), http.server.SimpleHTTPRequestHandler)
url = f'http://127.0.0.1:{server.server_port}/'
print(f'演示地址：{url}\n关闭本窗口或按 Control+C 可结束。', flush=True)
webbrowser.open(url)
try:
    server.serve_forever()
except KeyboardInterrupt:
    pass
finally:
    server.server_close()

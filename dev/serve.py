import http.server, functools, os, sys
class H(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()
    def log_message(self, *a):
        pass
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
port = int(os.environ.get('PORT', sys.argv[1] if len(sys.argv) > 1 else 8791))
http.server.ThreadingHTTPServer(('127.0.0.1', port), functools.partial(H, directory=root)).serve_forever()

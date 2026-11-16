"""Passagem TCP para um único diretório configurado. TLS termina na API, não neste processo."""
import os
import select
import socket
import socketserver
import threading

DEST = (os.environ['PTW_LDAP_HOST'], int(os.environ.get('PTW_LDAP_PORT', '636')))
LIMIT = threading.BoundedSemaphore(16)


class Handler(socketserver.BaseRequestHandler):
    def handle(self):
        if not LIMIT.acquire(blocking=False):
            return
        try:
            with socket.create_connection(DEST, timeout=5) as upstream:
                self.request.settimeout(10)
                upstream.settimeout(10)
                while True:
                    ready, _, _ = select.select([self.request, upstream], [], [], 15)
                    if not ready:
                        return
                    for source in ready:
                        data = source.recv(65536)
                        if not data:
                            return
                        (upstream if source is self.request else self.request).sendall(data)
        except (OSError, ValueError):
            pass
        finally:
            LIMIT.release()


class Server(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True
    request_queue_size = 16


with Server(('0.0.0.0', 1636), Handler) as server:
    server.serve_forever()

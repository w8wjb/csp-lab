#!/usr/bin/env python

import copy
import json
from http.server import BaseHTTPRequestHandler, HTTPServer
from typing import Optional
from urllib.parse import urlparse

LISTEN_HOSTNAME = "localhost"
LISTEN_PORT = 18282

csp_report_cache: dict[str, list['CSPViolationReport']] = {}


def to_origin(uri: str) -> Optional[str]:
    """
    Given a URL, construct an origin statement
    :param uri: URL string
    :return: '[host]:[port]'
    """
    parsed = urlparse(uri)
    port = parsed.port
    if not port:
        if parsed.scheme == 'https':
            port = 443
        else:
            port = 80

    return f"{parsed.hostname}:{port}"


class ContentSecurityPolicy:
    """Structure to parse and hold the parts of a Content Security Policy"""
    DIRECTIVE_ORDER = (
        'default-src', 'script-src', 'style-src', 'img-src', 'connect-src', 'font-src', 'object-src', 'media-src',
        'frame-src', 'sandbox', 'base-uri', 'child-src', 'form-action',
        'frame-ancestors', 'plugin-types', 'report-to', 'worker-src', 'manifest-src', 'prefetch-src', 'report-uri',
    )

    ALLOW = 1
    DENY = -1
    NO_MATCH = 0

    def __init__(self, origin: str, csp_def: str):
        self.origin = origin
        self.directives: dict[str, list[str]] = {}

        for directive_token in [x.strip() for x in csp_def.split(';')]:
            directive_values = directive_token.split()
            directive_name = directive_values.pop(0)
            self.directives[directive_name] = directive_values

    def __str__(self):
        serialized_directives: list[str] = []
        for directive_name in self.DIRECTIVE_ORDER:
            values = self.directives.get(directive_name, [])
            if len(values) > 0:
                joined = ' '.join(values)
                serialized_directives.append(f"{directive_name} {joined};")

        return " ".join(serialized_directives)

    def eval_source(self, source_pattern: str, target_url: str) -> int:
        """

        :param source_pattern:
        :param target_url:
        :return: 1 for allow, -1 for deny, 0 for no match
        """
        pattern = source_pattern.strip("'")

        def to_status(condition: bool) -> int:
            return self.ALLOW if condition else self.NO_MATCH

        if pattern == 'none':
            return self.DENY

        elif pattern == '*':
            if target_url.startswith('blob'):
                return self.NO_MATCH
            if target_url.startswith('filesystem:'):
                return self.NO_MATCH

            return self.ALLOW

        elif pattern == 'blob:':
            return to_status(target_url.startswith('blob'))

        elif pattern == 'filesystem:':
            return to_status(target_url.startswith('filesystem:'))

        elif pattern == 'self':
            url_origin = to_origin(target_url)
            return to_status(self.origin == url_origin)

        elif pattern == 'unsafe-inline':
            return to_status(target_url == 'inline')

        elif pattern == 'unsafe-eval':
            return to_status(target_url == 'eval')

        elif pattern.endswith(':'):
            return to_status(target_url.startswith(pattern.removesuffix(':')))

        elif '//' in pattern:
            pattern_scheme = urlparse(pattern).scheme
            url_scheme = urlparse(target_url).scheme

            if pattern_scheme != url_scheme:
                return self.NO_MATCH

            pattern_origin = to_origin(pattern)
            url_origin = to_origin(target_url)
            if pattern_origin.startswith('*'):
                pattern_origin = pattern_origin.removeprefix('*')
                return to_status(url_origin.endswith(pattern_origin))
            else:
                return to_status(pattern_origin == url_origin)

        elif '.' in pattern:
            pattern_origin = to_origin('https://' + pattern)
            url_origin = to_origin(target_url)
            if pattern_origin.startswith('*'):
                pattern_origin = pattern_origin.removeprefix('*')
                return to_status(url_origin.endswith(pattern_origin))
            else:
                return to_status(pattern_origin == url_origin)

        return self.NO_MATCH

    def allow(self, report: 'CSPViolationReport'):
        """Adjust this policy to allow a particular CSP violation"""
        violated_directive = report.violated_directive

        # Collapse the sub -elem and -attr directives into the more generic version
        # If developers want to be more specific, they can always adjust the suggested CSP
        if violated_directive == 'script-src-elem' or violated_directive == 'script-src-attr':
            violated_directive = 'script-src'
        elif violated_directive == 'style-src-elem' or violated_directive == 'style-src-attr':
            violated_directive = 'style-src'

        source_list = self.directives.get(violated_directive, [])

        new_source_list = source_list.copy()

        for source in source_list:
            status = self.eval_source(source, report.blocked_uri)
            if status > 0:
                # There is a source that allows this URL, so we're all set
                return
            elif status < 0:
                # There is a source that explicitly denies this URL, so remove it
                new_source_list.remove(source)

        url_parts = urlparse(report.blocked_uri)
        if url_parts.netloc:
            blocked_origin = to_origin(report.blocked_uri)
            document_origin = report.document_origin
            if blocked_origin == document_origin:
                new_source_list.append("'self'")
            else:
                new_source = f"{url_parts.scheme}://{url_parts.netloc}"
                new_source_list.append(new_source)
        elif report.blocked_uri == 'inline':
            new_source_list.append("'unsafe-inline'")
        elif report.blocked_uri == 'eval':
            new_source_list.append("'unsafe-eval'")
        elif report.blocked_uri == 'data':
            new_source_list.append('data:')
        elif report.blocked_uri == 'blob':
            new_source_list.append('blob:')
        else:
            print(f"Unhandled directive {report.violated_directive} {report.blocked_uri}")

        self.directives[violated_directive] = new_source_list


class CSPViolationReport:
    """
    Follows specification found here: https://www.w3.org/TR/CSP2/#violation-reports
    """

    def __init__(self, body):
        data: dict = json.loads(body.decode('utf-8')).get('csp-report', dict())
        self.blocked_uri: str = data['blocked-uri']
        self.document_uri: str = data['document-uri']
        self.document_origin: Optional[str] = to_origin(self.document_uri)
        self.effective_directive: str = data['effective-directive']
        self.original_policy: ContentSecurityPolicy = ContentSecurityPolicy(self.document_origin,
                                                                            data['original-policy'])
        self.referrer: str = data['referrer']
        self.status_code: str = data['status-code']
        self.violated_directive: str = data['violated-directive']
        self.source_file: Optional[str] = data.get('source-file', None)
        self.line_number: Optional[int] = data.get('line-number', None)
        self.column_number: Optional[int] = data.get('column-number', None)

    def __str__(self):
        return f'{self.document_origin} {self.violated_directive} {self.blocked_uri}'


class CSPSuggestServer(BaseHTTPRequestHandler):

    def __init__(self, request, client_address, server):
        super().__init__(request, client_address, server)
        self.csp_cache = {}

    def do_GET(self):
        if self.path.startswith("/csp-report"):
            # Performing a GET request to /csp-report will collect all the reported violations and suggest a CSP to
            # accommodate them

            # Use the `X-Origin` header to specify which domain to provide the report for
            origin = self.headers['X-Origin']
            parsed_url = urlparse(origin)

            self.send_csp_suggestion(parsed_url.hostname)

        else:
            self.send_homepage()

    def do_POST(self):
        content_length = int(self.headers['Content-Length'])
        content_type = self.headers['Content-Type']

        # CSP reports should have this MIME type
        if content_type == 'application/csp-report':
            body = self.rfile.read(content_length)
            self.handle_csp_report(body)

            self.send_response(200)
            self.send_header("Content-type", "text/html")
            self.end_headers()

        else:
            self.send_error(400, "Invalid POST request")

    def do_DELETE(self):
        global csp_report_cache

        if self.path.startswith("/csp-report"):
            # Use the `X-Origin` header to specify which domain to clear data for
            origin = self.headers.get('X-Origin', None)
            if origin:
                parsed_url = urlparse(origin)
                csp_report_cache.pop(parsed_url.hostname, None)

        self.send_response(200)
        self.end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "OPTIONS, GET, HEAD, POST, DELETE")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def handle_csp_report(self, body):
        global csp_report_cache

        report = CSPViolationReport(body)

        hostname = urlparse(report.document_uri).hostname

        reports: list[CSPViolationReport] = csp_report_cache.get(hostname, [])
        reports.append(report)
        csp_report_cache[hostname] = reports

    def send_homepage(self):
        self.send_response(200)
        self.send_header("Content-type", "text/html")
        self.end_headers()

        instructions = """
<html><head><title>CSP Suggest</title></head>
    <body>
        <h1>Welcome to the CSP Suggest service</h1>

        <h2>API</h2>
        <h3>/csp-report</h3>
        
        <h4>POST</h4>        
        <p>When used as the target of a <code>report-uri</code>. 
        This endpoint will collect reports for various violations.</p>
        <h4>GET</h4>
        <p>GET requests to this endpoint will generate a suggested Content Security Policy 
        that will accommodate the violation reports that have been collected up to the point the 
        report was requested</p>
        <p>Please include a <code>X-Origin</code> header with the URL of the page you would like to generate a 
        CSP for.</p>
        <h4>DELETE</h4>
        <p>A DELETE request will clear all collected CSP violation reports from memory</p>
        <p>Please include a <code>X-Origin</code> header with the URL of the page you would like to generate a 
        CSP for.</p>
    </body>
<html>
        """
        self.wfile.write(instructions.encode("utf-8"))

    def send_csp_suggestion(self, hostname):
        global csp_report_cache

        reports = csp_report_cache.get(hostname, None)
        if not reports:
            self.send_error(404, f"Records for {hostname} not found")
            return

        self.send_response(200)
        self.send_header("Content-type", "text")
        self.end_headers()

        policy = None

        for report in reports:
            if not policy:
                policy = copy.copy(report.original_policy)

            policy.allow(report)

        # New policy won't need 'report-uri'
        policy.directives.pop('report-uri', None)

        policy_str = str(policy)

        self.wfile.write(policy_str.encode("utf-8"))
        self.wfile.flush()


if __name__ == "__main__":
    webServer = HTTPServer((LISTEN_HOSTNAME, LISTEN_PORT), CSPSuggestServer)
    print("Server started http://%s:%s" % (LISTEN_HOSTNAME, LISTEN_PORT))

    try:
        webServer.serve_forever()
    except KeyboardInterrupt:
        pass

    webServer.server_close()
    print("Server stopped.")

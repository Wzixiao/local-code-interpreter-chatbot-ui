from flask import Flask, request, jsonify, stream_with_context, Response
from jupyter_client import KernelManager
import json
import subprocess
from flask_cors import CORS, cross_origin
import logging
import atexit

logging.basicConfig(level="INFO")


class KernelSessionManager:
    """
    A manager for Jupyter kernel sessions.
    """
    def __init__(self):
        self.kernels = {}

    def get_or_create_kernel(self, session_id: str, force_create: bool = True) -> KernelManager:
        """
        Fetches the kernel for a given session ID or creates one if not available.
        
        Args:
            session_id (str): The unique session identifier.
            force_create (bool): Whether to forcefully create a kernel if not exists. Default is True.
            
        Returns:
            KernelManager: The Jupyter kernel manager instance.
        """
        if session_id not in self.kernels and force_create:
            km = KernelManager(kernel_name='python3')
            km.start_kernel()
            self.kernels[session_id] = km
        return self.kernels.get(session_id)

    def shutdown_kernels(self):
        """
        Shuts down all active kernels.
        """
        for session_id, km in self.kernels.items():
            try:
                km.shutdown_kernel()
                logging.info(f"Shutdown kernel for session {session_id}")
            except Exception as e:
                logging.error(f"Failed to shutdown kernel for session {session_id}. Error: {e}")


class ExecutionService:
    """
    A service to execute Python code or shell commands using Jupyter kernels.
    """
    def __init__(self, kernel_manager, session_id):
        self.km = kernel_manager.get_or_create_kernel(session_id)
        self.session_id = session_id

    def format_sse(self, content: str, is_end: bool = False) -> str:
        """
        Formats the given content into Server-Sent Events (SSE) format.
        
        Args:
            content (str): The content to be formatted.
            is_end (bool, optional): Indicates if the content is the last message. Defaults to False.
            
        Returns:
            str: The content formatted in SSE format.
        """
        data = {
            "content": content,
            "end": is_end,
            "session_id": self.session_id
        }
        message = json.dumps(data)
        logging.info(f"message: {message}")
        return f"data: {message}\n\n"

    def run_shell(self, command):
        """
        Executes a shell command and yields its output.
        
        Args:
            command (str): The shell command to execute.
            
        Yields:
            str: The shell output in SSE format.
        """
        try:
            shell_output = subprocess.check_output(command, shell=True, stderr=subprocess.STDOUT).decode("utf-8")
            yield self.format_sse(shell_output, True)
        except Exception as e:
            yield self.format_sse(str(e), True)

    def run_code(self, code):
        """
        Executes Python code using a Jupyter kernel and yields its output.
        
        Args:
            code (str): The Python code to execute.
            
        Yields:
            str: The Python code output in SSE format.
        """
        client = self.km.client()
        client.start_channels()
        client.allow_stdin = False

        output_received = False

        try:
            msg_id = client.execute(code)
            while True:
                msg = client.get_iopub_msg()
                msg_type = msg['msg_type']
                content = msg['content']

                if msg['parent_header'].get('msg_id') == msg_id:
                    if msg_type in ['stream', 'execute_result', 'error']:
                        output_received = True

                        if msg_type == 'stream':
                            yield self.format_sse(content['text'])
                        elif msg_type == 'execute_result':
                            yield self.format_sse(content['data'].get('text/plain', ''))
                        elif msg_type == 'error':
                            yield self.format_sse("\n".join(content['traceback']))

                if msg_type == 'status' and content.get('execution_state') == 'idle':
                    if not output_received:
                        yield self.format_sse("No output from the code execution.")
                    else:
                        yield self.format_sse("")
                    break

        finally:
            yield self.format_sse("", True)

class AppService:
    """
    The main application service for handling incoming requests.
    """
    def __init__(self):
        self.app = Flask(__name__)
        CORS(self.app)
        self.kernel_manager = KernelSessionManager()
        atexit.register(self.kernel_manager.shutdown_kernels)
        
        # 创建一个映射，其中function名映射到ExecutionService的方法
        self.function_map = {
            "run_shell": self.execute_with_service("run_shell"),
            "run_code": self.execute_with_service("run_code")
        }

        @self.app.route('/execute', methods=['POST'])
        def execute():
            arguments = request.json.get('arguments')
            session_id = request.json.get('sessionId')
            functionName = request.json.get('functionName')

            logging.info(f"session_id: {session_id}")
            logging.info(f"arguments: {arguments}")
            logging.info(f"functionName: {functionName}")

            if not functionName or not session_id or not arguments:
                return jsonify({"error": "No execution data provided"}), 400

            function = self.function_map.get(functionName)
            if not function:
                return jsonify({"error": f"Unknown function name {functionName}"}), 400

            return Response(stream_with_context(function(session_id, **arguments)), content_type="text/event-stream")

    def execute_with_service(self, method_name):
        """
        Creates a function to execute the desired method on the ExecutionService using a specific session.
        
        Args:
            method_name (str): The method name to be executed on the ExecutionService.
            
        Returns:
            function: A function that accepts a session_id and keyword arguments to execute the specified method.
        """
        def inner_function(session_id, **kwargs):
            execution_service = ExecutionService(self.kernel_manager, session_id)
            method = getattr(execution_service, method_name)
            return method(**kwargs)
        return inner_function

    def run(self):
        """
        Runs the Flask app.
        """
        self.app.run(debug=True)


if __name__ == '__main__':
    app_service = AppService()
    app_service.run()

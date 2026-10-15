# The 360° stitching service (stitcher/README.md). Hugin's command-line tools and enblend do the
# work; a small Python server wraps them.
FROM debian:bookworm-slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends hugin-tools enblend python3 python3-pil python3-numpy \
 && rm -rf /var/lib/apt/lists/*

RUN useradd --system --create-home stitcher
WORKDIR /app
COPY stitch.py server.py selftest.py ./
USER stitcher

ENV PORT=8090
EXPOSE 8090
HEALTHCHECK --interval=10s --timeout=3s --retries=5 CMD python3 -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8090/health')"
CMD ["python3", "server.py"]

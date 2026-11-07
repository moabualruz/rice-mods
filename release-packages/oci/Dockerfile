# Image from already-built, already-verified release binaries: no compilation and no RUN step, so a multi-platform
# build needs no emulation. The context holds linux/amd64/BINARY and linux/arm64/BINARY (oci-image.sh build fills it
# from the signed release archives).
FROM scratch
ARG TARGETOS
ARG TARGETARCH
ARG BINARY
ARG VERSION
COPY ${TARGETOS}/${TARGETARCH}/${BINARY} /${BINARY}
COPY --chown=65532:65532 state /state
LABEL org.opencontainers.image.version="${VERSION}" \
      org.opencontainers.image.licenses="Apache-2.0" \
      org.opencontainers.image.source="https://github.com/moabualruz/rice-release"
USER 65532:65532
# ENTRYPOINT is set by build through a generated Dockerfile line (see oci-image.sh).

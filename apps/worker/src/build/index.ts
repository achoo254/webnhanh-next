// What the server uses of the build modules: checks of what people type, the project check before the first build,
// reading an uploaded zip, and the builder itself for the dev server (one process on PGlite).
export { BUILD_STEPS, inboxZip, type BuildDirs, type BuildStep } from './build-job';
export { loadBuilderConfig } from './builder-config';
export { startBuilder, type RunningBuilder } from './builder-loop';
export { detectProject, FRAMEWORKS, type Detection, type DetectionWarning, type Framework, type ProjectSource } from './detect';
export { SourceError, ZIP_MAX_BYTES } from './fetch-source';
export { zipSource, MAX_READ_BYTES } from './project-sources';
export { buildSettingsSchema, checkBranch, checkBuildCommand, checkRelativeDir, isCommitSha, joinRel, parseRepoUrl, rawFileUrl, type RepoUrl } from './settings';

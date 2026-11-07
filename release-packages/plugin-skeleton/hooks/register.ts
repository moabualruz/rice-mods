import type { Register } from 'claude-code'

// Fixture mod: refuses Edit calls on dotenv files and shows a status entry after a failed Bash call. It reads no
// environment variable, makes no network call and calls no model, which the capability baseline records.
const PROTECTED = /(^|\/)\.env(\.|$)/

export const register: Register = on => {
  on('tool.call', { tool: 'Edit' }, ($, e, next) =>
    PROTECTED.test(e.file_path) ? { deny: `${$.plugin.name}: ${e.file_path} is protected here.` } : next(e),
  ).catch(($, e, next) => (next.called ? next(e) : { deny: `${$.plugin.name}: its guard failed.` }))

  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const ran = await next(e)
    $.ui.status(ran.deny === undefined && ran.isError === true ? `failed: ${e.command.slice(0, 40)}` : undefined)
    return ran
  })
}

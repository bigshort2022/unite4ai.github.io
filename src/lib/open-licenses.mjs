/** Single source of truth for SPDX open license allowlist. */
export const OPEN_LICENSES = Object.freeze([
  'apache-2.0', 'mit', 'bsd-3-clause', 'cc-by-4.0', 'cc-by-sa-4.0',
  'cc0-1.0', 'gpl-3.0', 'agpl-3.0', 'lgpl-3.0', 'odc-by-1.0', 'mpl-2.0',
]);

export const OPEN_LICENSE_SET = new Set(OPEN_LICENSES);

export const OPEN_WASHED = Object.freeze({
  'llama-2': 'Restricts use above a monthly-active-user threshold.',
  'llama-3': 'Restricts use above a monthly-active-user threshold.',
  openrail: 'Contains downstream use restrictions; not an OSI-approved open license.',
  'creativeml-openrail-m': 'Contains downstream use restrictions.',
  'cc-by-nc-4.0': 'Non-commercial clause — not an open license under the OSD.',
  'cc-by-nd-4.0': 'No-derivatives clause — blocks fine-tuning and adaptation.',
  proprietary: 'Not open by any definition.',
});

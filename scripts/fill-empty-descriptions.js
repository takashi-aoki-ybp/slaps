// Retired: metadata templates are not curation. Keep empty descriptions empty.
// This command must not read/write the catalog or call external services.
console.error('Automatic description filling is disabled. Add only individually verified, track-specific copy; genuine user comments must be preserved.');
process.exitCode = 1;

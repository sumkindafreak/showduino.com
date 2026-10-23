// The job accepts no caller-supplied user IDs. Only the database can select due accounts.
export async function processDeletions(client, secret) {
  const claimed = await client.rpc('claim_account_deletions', {p_secret: secret});
  if (claimed.error) return {status: 403, processed: 0};
  let processed = 0, failed = 0;
  for (const userId of claimed.data || []) {
    try {
      // Block refresh/new sign-ins before cleanup. Existing JWT storage access is gated by SQL.
      const banned = await client.auth.admin.updateUserById(userId, {ban_duration: '876000h'});
      if (banned.error) throw banned.error;
      // Delete through Storage, never SQL: this removes actual objects, not just metadata.
      for (const bucket of ['hauntsync-avatars', 'community-images']) {
        const store = client.storage.from(bucket);
        // Delete the first page repeatedly so deleting a page never skips the next one.
        for (;;) {
          const listed = await store.list(userId, {limit: 100, offset: 0});
          if (listed.error) throw listed.error;
          if (!listed.data?.length) break;
          if (listed.data.some(f => !f.id || /\//.test(f.name))) throw Error('Unexpected storage folder');
          const removed = await store.remove(listed.data.map(f => `${userId}/${f.name}`));
          if (removed.error) throw removed.error;
        }
      }
      // Hard-delete Auth only after Storage succeeded. FK cascades remove profile, projects,
      // devices, publications, posts, comments, shares, follows, sessions and this queue row.
      const deleted = await client.auth.admin.deleteUser(userId, false);
      if (deleted.error) throw deleted.error;
      processed++;
    } catch (_) {
      failed++;
      // No user identifiers, tokens or personal data in logs. The lease expires for retries.
      console.error('Account deletion failed; the scheduled worker will retry.');
    }
  }
  return {status: failed ? 503 : 200, processed, failed};
}

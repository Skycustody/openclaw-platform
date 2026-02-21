import axios, { AxiosInstance } from 'axios';

class CloudflareDNS {
  private client: AxiosInstance;
  private zoneId: string;

  constructor() {
    this.zoneId = process.env.CLOUDFLARE_ZONE_ID || '';

    this.client = axios.create({
      baseURL: 'https://api.cloudflare.com/client/v4',
      headers: {
        Authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN || ''}`,
        'Content-Type': 'application/json',
      },
      timeout: 15000,
    });
  }

  private enabled(): boolean {
    return !!(process.env.CLOUDFLARE_API_TOKEN && this.zoneId);
  }

  /** Create or update an A record pointing subdomain.DOMAIN → workerIp */
  async upsertRecord(subdomain: string, workerIp: string): Promise<string | null> {
    if (!this.enabled()) {
      console.warn('[cloudflare] CLOUDFLARE_API_TOKEN or CLOUDFLARE_ZONE_ID not set — skipping DNS');
      return null;
    }

    const domain = process.env.DOMAIN || 'yourdomain.com';
    const fqdn = `${subdomain}.${domain}`;

    try {
      const existing = await this.client.get(
        `/zones/${this.zoneId}/dns_records`,
        { params: { type: 'A', name: fqdn } }
      );
      const records = existing.data?.result || [];

      if (records.length > 0) {
        const recordId = records[0].id;
        await this.client.put(`/zones/${this.zoneId}/dns_records/${recordId}`, {
          type: 'A', name: fqdn, content: workerIp, ttl: 1, proxied: true,
        });
        console.log(`[cloudflare] Updated DNS: ${fqdn} → ${workerIp} (proxied)`);
        return recordId;
      }

      const res = await this.client.post(`/zones/${this.zoneId}/dns_records`, {
        type: 'A', name: fqdn, content: workerIp, ttl: 1, proxied: true,
      });
      const recordId = res.data?.result?.id;
      console.log(`[cloudflare] Created DNS: ${fqdn} → ${workerIp}`);
      return recordId;
    } catch (err: any) {
      console.error('[cloudflare] DNS upsert failed:', err.response?.data || err.message);
      return null;
    }
  }

  /** Remove all A records for subdomain.DOMAIN */
  async deleteRecord(subdomain: string): Promise<void> {
    if (!this.enabled()) return;

    const domain = process.env.DOMAIN || 'yourdomain.com';
    const fqdn = `${subdomain}.${domain}`;

    try {
      const existing = await this.client.get(
        `/zones/${this.zoneId}/dns_records`,
        { params: { type: 'A', name: fqdn } }
      );
      for (const record of existing.data?.result || []) {
        await this.client.delete(`/zones/${this.zoneId}/dns_records/${record.id}`);
        console.log(`[cloudflare] Deleted DNS: ${fqdn} (${record.id})`);
      }
    } catch (err: any) {
      console.error('[cloudflare] DNS delete failed:', err.response?.data || err.message);
    }
  }
}

export const cloudflareDNS = new CloudflareDNS();

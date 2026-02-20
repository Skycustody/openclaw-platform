
import axios, { AxiosInstance } from 'axios';

class HostingerManager {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: 'https://developers.hostinger.com/api/vps/v1',
      headers: {
        Authorization: `Bearer ${process.env.HOSTINGER_API_KEY}`,
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    });
  }

  async provisionNewServer(): Promise<string> {
    try {
      const res = await this.client.post('/virtual-machines', {
        plan: 'KVM1', // 4GB RAM for testing; change to KVM8 for production
        region: 'us-east',
        os_template: 'ubuntu-22-04',
        hostname: `openclaw-${Date.now()}`,
        post_install_script_id: process.env.HOSTINGER_SCRIPT_ID,
      });

      console.log('New server provisioning started:', res.data?.id);
      return res.data?.id;
    } catch (err: any) {
      console.error('Hostinger provisioning failed:', err.response?.data || err.message);
      throw new Error('Failed to provision new server');
    }
  }

  async listServers(): Promise<any[]> {
    try {
      const res = await this.client.get('/virtual-machines');
      return res.data || [];
    } catch (err: any) {
      console.error('Hostinger list failed:', err.response?.data || err.message);
      return [];
    }
  }

  async deleteServer(hostingerId: string): Promise<void> {
    try {
      await this.client.delete(`/virtual-machines/${hostingerId}`);
      console.log('Server deleted:', hostingerId);
    } catch (err: any) {
      console.error('Hostinger delete failed:', err.response?.data || err.message);
    }
  }
}

export const hostingerManager = new HostingerManager();

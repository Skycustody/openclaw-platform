import axios, { AxiosInstance } from 'axios';

class HostingerManager {
  private vpsClient: AxiosInstance;
  private billingClient: AxiosInstance;

  constructor() {
    const apiKey = process.env.HOSTINGER_API_KEY;
    const headers = {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    };

    this.vpsClient = axios.create({
      baseURL: 'https://developers.hostinger.com/api/vps/v1',
      headers,
      timeout: 60000,
    });

    this.billingClient = axios.create({
      baseURL: 'https://developers.hostinger.com/api/billing/v1',
      headers,
      timeout: 30000,
    });
  }

  async provisionNewServer(): Promise<string> {
    const scriptId = parseInt(process.env.HOSTINGER_SCRIPT_ID || '0', 10);

    const { itemId, templateId, dataCenterId } = await this.resolveProvisionConfig();

    try {
      const setup: Record<string, any> = {
        template_id: templateId,
        data_center_id: dataCenterId,
        hostname: `openclaw-${Date.now()}`,
      };

      if (scriptId) {
        setup.post_install_script_id = scriptId;
      }

      const sshPublicKey = process.env.WORKER_SSH_PUBLIC_KEY;
      if (sshPublicKey) {
        setup.public_key = { name: 'openclaw-api', key: sshPublicKey };
      }

      const res = await this.vpsClient.post('/virtual-machines', {
        item_id: itemId,
        setup,
      });

      const vmId = res.data?.virtual_machine?.id ?? res.data?.id;
      console.log('New server provisioning started:', vmId);
      return String(vmId);
    } catch (err: any) {
      console.error('Hostinger provisioning failed:', err.response?.data || err.message);
      throw new Error('Failed to provision new server');
    }
  }

  /** Resolve item_id, template_id, data_center_id from env or by auto-discovery from Hostinger API. */
  private async resolveProvisionConfig(): Promise<{
    itemId: string;
    templateId: number;
    dataCenterId: number;
  }> {
    let itemId = process.env.HOSTINGER_ITEM_ID;
    let templateId = parseInt(process.env.HOSTINGER_TEMPLATE_ID || '0', 10);
    let dataCenterId = parseInt(process.env.HOSTINGER_DATA_CENTER_ID || '0', 10);

    if (itemId && templateId && dataCenterId) {
      return { itemId, templateId, dataCenterId };
    }

    console.log('Hostinger: some IDs missing in .env, auto-discovering from API...');

    if (!itemId) {
      const catalog = await this.getCatalog();
      const items = Array.isArray(catalog) ? catalog : (catalog as any)?.data ?? [];
      for (const item of items) {
        const prices = item.prices ?? item.item_prices ?? [];
        const priceId = prices[0]?.id ?? item.id;
        if (priceId) {
          itemId = String(priceId);
          console.log('Hostinger: using catalog item_id:', itemId);
          break;
        }
      }
      if (!itemId) {
        throw new Error('Could not discover HOSTINGER_ITEM_ID. Set it in .env or check Hostinger API access.');
      }
    }

    if (!templateId) {
      const templates = await this.getTemplates();
      const list = Array.isArray(templates) ? templates : (templates as any)?.data ?? [];
      const ubuntu = list.find(
        (t: any) =>
          String(t.name || '').toLowerCase().includes('ubuntu') &&
          String(t.name || '').includes('22')
      );
      if (ubuntu?.id) {
        templateId = Number(ubuntu.id);
        console.log('Hostinger: using template_id:', templateId, ubuntu.name);
      }
      if (!templateId) {
        const first = list[0];
        if (first?.id) {
          templateId = Number(first.id);
          console.log('Hostinger: using first template_id:', templateId, first.name);
        }
      }
      if (!templateId) {
        throw new Error('Could not discover HOSTINGER_TEMPLATE_ID. Set it in .env or check Hostinger API.');
      }
    }

    if (!dataCenterId) {
      const dataCenters = await this.getDataCenters();
      const list = Array.isArray(dataCenters) ? dataCenters : (dataCenters as any)?.data ?? [];
      const first = list[0];
      if (first?.id) {
        dataCenterId = Number(first.id);
        console.log('Hostinger: using data_center_id:', dataCenterId, first.name || first.location);
      }
      if (!dataCenterId) {
        throw new Error('Could not discover HOSTINGER_DATA_CENTER_ID. Set it in .env or check Hostinger API.');
      }
    }

    return { itemId, templateId, dataCenterId };
  }

  async listServers(): Promise<any[]> {
    try {
      const res = await this.vpsClient.get('/virtual-machines');
      return res.data || [];
    } catch (err: any) {
      console.error('Hostinger list failed:', err.response?.data || err.message);
      return [];
    }
  }

  async getServerDetails(vmId: number): Promise<any> {
    try {
      const res = await this.vpsClient.get(`/virtual-machines/${vmId}`);
      return res.data;
    } catch (err: any) {
      console.error('Hostinger details failed:', err.response?.data || err.message);
      return null;
    }
  }

  async deleteServer(hostingerId: string): Promise<void> {
    try {
      await this.vpsClient.delete(`/virtual-machines/${hostingerId}`);
      console.log('Server deleted:', hostingerId);
    } catch (err: any) {
      console.error('Hostinger delete failed:', err.response?.data || err.message);
    }
  }

  async getDataCenters(): Promise<any[]> {
    try {
      const res = await this.vpsClient.get('/data-centers');
      return res.data || [];
    } catch (err: any) {
      console.error('Failed to fetch data centers:', err.response?.data || err.message);
      return [];
    }
  }

  async getTemplates(): Promise<any[]> {
    try {
      const res = await this.vpsClient.get('/os-templates');
      return res.data || [];
    } catch (err: any) {
      console.error('Failed to fetch templates:', err.response?.data || err.message);
      return [];
    }
  }

  async getCatalog(): Promise<any[]> {
    try {
      const res = await this.billingClient.get('/catalog', { params: { category: 'vps' } });
      return res.data || [];
    } catch (err: any) {
      console.error('Failed to fetch catalog:', err.response?.data || err.message);
      return [];
    }
  }
}

export const hostingerManager = new HostingerManager();

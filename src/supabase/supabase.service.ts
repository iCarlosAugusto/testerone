import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

@Injectable()
export class SupabaseService {
    private supabase: SupabaseClient;

    constructor(private configService: ConfigService) {
        const supabaseUrl = this.configService.get<string>('SUPABASE_URL');
        const supabaseServiceKey = this.configService.get<string>('SUPABASE_SERVICE_KEY');

        if (!supabaseUrl || !supabaseServiceKey) {
            throw new Error('Supabase configuration is missing');
        }

        this.supabase = createClient(supabaseUrl, supabaseServiceKey, {
            auth: {
                autoRefreshToken: false,
                persistSession: false,
            },
        });
    }

    getClient(): SupabaseClient {
        return this.supabase;
    }

    async signUp(email: string, password: string, metadata: Record<string, unknown>) {
        const { data, error } = await this.supabase.auth.admin.createUser({
            email,
            password,
            email_confirm: true,
            user_metadata: metadata,
        });

        if (error) {
            throw error;
        }

        return data;
    }

    async signIn(email: string, password: string) {
        const { data, error } = await this.supabase.auth.signInWithPassword({
            email,
            password,
        });

        if (error) {
            throw error;
        }

        return data;
    }

    async signOut(token: string) {
        // Admin sign out using the access token
        const { error } = await this.supabase.auth.admin.signOut(token);

        if (error) {
            throw error;
        }

        return { success: true };
    }

    async getUser(userId: string) {
        const { data, error } = await this.supabase.auth.admin.getUserById(userId);

        if (error) {
            throw error;
        }

        return data.user;
    }
}

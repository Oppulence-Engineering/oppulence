'use server';

import { TwilioConfigParams, TwilioConfigResponse, TwilioConfig, InboundConfigResponse } from "../lib/types/voice_types";
import { twilioConfigsCollection } from "../lib/mongodb";
import { ObjectId } from "mongodb";
import twilio from 'twilio';
import { Twilio } from 'twilio';
import { z } from "zod";
import { WithStringId } from "../lib/types/types";
import { projectAuthCheck } from "./project.actions";

// Helper function to serialize MongoDB documents
function serializeConfig(config: any) {
    return {
        ...config,
        _id: config._id.toString(),
        createdAt: config.createdAt.toISOString(),
    };
}

// Real implementation for configuring Twilio number
export async function configureTwilioNumber(params: z.infer<typeof TwilioConfigParams>): Promise<TwilioConfigResponse> {
    await projectAuthCheck(params.project_id);
    try {
        const client = twilio(params.account_sid, params.auth_token);
        
        try {
            // List all phone numbers and find the matching one
            const numbers = await client.incomingPhoneNumbers.list();
            const phoneExists = numbers.some(
                number => number.phoneNumber === params.phone_number
            );
            
            if (!phoneExists) {
                throw new Error('Phone number not found in this account');
            }
        } catch (error) {
            throw new Error(
                error instanceof Error 
                    ? error.message 
                    : 'Invalid phone number or phone number does not belong to this account'
            );
        }

        // Save to MongoDB after successful validation
        await saveTwilioConfig(params);

        return { success: true };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to configure Twilio number'
        };
    }
}

// Save Twilio configuration to MongoDB
async function saveTwilioConfig(params: z.infer<typeof TwilioConfigParams>): Promise<void> {
    // Find existing config for this project
    const existingConfig = await twilioConfigsCollection.findOne({
        project_id: params.project_id,
        status: 'active' as const
    });

    const configToSave: z.infer<typeof TwilioConfig> = {
        phone_number: params.phone_number,
        account_sid: params.account_sid,
        auth_token: params.auth_token,
        label: params.label || '',  // Use empty string instead of undefined
        project_id: params.project_id,
        createdAt: existingConfig?.createdAt || new Date(),
        status: 'active' as const
    };
    try {
        // Configure inbound calls first
        await configureInboundCall(
            params.phone_number,
            params.account_sid,
            params.auth_token,
        );

        // Then save/update the config in database
        if (existingConfig) {
            await twilioConfigsCollection.updateOne(
                { _id: existingConfig._id },
                { $set: configToSave }
            );
        } else {
            await twilioConfigsCollection.insertOne(configToSave);
        }

        if (!(await twilioConfigsCollection.findOne({
            project_id: params.project_id,
            status: 'active'
        }))) {
            throw new Error('Failed to save Twilio configuration');
        }

    } catch (error) {
        throw error;
    }
}

// Get Twilio configuration for a workflow
export async function getTwilioConfigs(projectId: string): Promise<WithStringId<z.infer<typeof TwilioConfig>>[]> {
    await projectAuthCheck(projectId);
    const configs = await twilioConfigsCollection
        .find({ 
            project_id: projectId,
            status: 'active' as const
        })
        .sort({ createdAt: -1 })
        .limit(1)
        .toArray();
    
    const serializedConfigs = configs.map(serializeConfig);
    return serializedConfigs;
}

// Delete a Twilio configuration (soft delete)
export async function deleteTwilioConfig(projectId: string, configId: string) {
    await projectAuthCheck(projectId);
    const result = await twilioConfigsCollection.updateOne(
        {
            _id: new ObjectId(configId),
            project_id: projectId
        },
        {
            $set: { status: 'deleted' as const }
        }
    );
    return result;
}

async function configureInboundCall(
    phone_number: string,
    account_sid: string,
    auth_token: string,
): Promise<InboundConfigResponse> {
    try {
        // Normalize phone number format
        if (!phone_number.startsWith('+')) {
            phone_number = '+' + phone_number;
        }

        // Initialize Twilio client
        const client = new Twilio(account_sid, auth_token);

        // Find the phone number in Twilio account
        const incomingPhoneNumbers = await client.incomingPhoneNumbers.list({ phoneNumber: phone_number });
        if (!incomingPhoneNumbers.length) {
            throw new Error(`Phone number ${phone_number} not found in Twilio account`);
        }

        const phoneSid = incomingPhoneNumbers[0].sid;
        const currentVoiceUrl = incomingPhoneNumbers[0].voiceUrl;
        const wasPreviouslyConfigured = Boolean(currentVoiceUrl);

        // Get base URL from environment - MUST be a public URL
        const baseUrl = process.env.VOICE_API_URL;
        if (!baseUrl) {
            throw new Error('Voice service URL not configured. Please set VOICE_API_URL environment variable.');
        }

        // Validate URL is not localhost
        if (baseUrl.includes('localhost')) {
            throw new Error('Voice service must use a public URL, not localhost.');
        }

        const inboundUrl = `${baseUrl}/api/twilio/inbound_call`;
        // Update the phone number configuration
        await client.incomingPhoneNumbers(phoneSid).update({
            voiceUrl: inboundUrl,
            voiceMethod: 'POST',
            statusCallback: `${baseUrl}/call-status`,
            statusCallbackMethod: 'POST'
        });

        return {
            status: wasPreviouslyConfigured ? 'reconfigured' : 'configured',
            phone_number: phone_number,
            previous_webhook: wasPreviouslyConfigured ? currentVoiceUrl : undefined
        };

    } catch (err: unknown) {
        // Type guard for error with message property
        if (err instanceof Error) {
            if (err.message.includes('localhost')) {
                throw new Error('Voice service needs to be accessible from the internet. Please check your configuration.');
            }
            // Type guard for Twilio error
            if ('code' in err && err.code === 21402) {
                throw new Error('Invalid voice service URL. Please make sure it\'s a public, secure URL.');
            }
        }
        
        // If we can't determine the specific error, throw a generic one
        throw new Error('Failed to configure phone number. Please check your settings and try again.');
    }
}

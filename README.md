# AWS Rekognition GUI

A local desktop application with a browser-based GUI for interacting with AWS Rekognition services.

## Features

- List and describe Rekognition collections
- Create and delete Rekognition collections
- Add (index) and delete faces in collections
- Search faces in collections using image upload
- Detect labels in images
- Local-only AWS credential management
- Health monitoring and error handling

## Prerequisites

1. Python 3.8 or higher
2. AWS Account with Rekognition access
3. AWS IAM Credentials

## Setup

1. Clone this repository:
   ```bash
   git clone [repository-url]
   cd aws-rekognition-gui
   ```

2. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

3. Run the application:
   ```bash
   python app.py
   ```

4. Open your browser and navigate to:
   ```
   http://localhost:5000
   ```

## Deleting Collections and Faces

- **Delete a Collection:** Go to the Collections tab, select a collection, and click the delete button. Confirm the action in the dialog.
- **Delete Faces:** You can delete faces from a collection by providing their Face IDs (obtained from search or add operations) in the delete faces dialog.
- Both actions require the corresponding AWS IAM permissions (see above).

## AWS IAM Setup

1. Create an IAM User:
   - Go to AWS IAM Console
   - Create a new IAM user
   - Enable programmatic access

2. Attach the following permissions:
   ```json
   {
       "Version": "2012-10-17",
       "Statement": [
           {
               "Effect": "Allow",
               "Action": [
                   "rekognition:ListCollections",
                   "rekognition:DescribeCollection",
                   "rekognition:SearchFacesByImage",
                   "rekognition:DetectLabels",
                   "rekognition:CreateCollection",
                   "rekognition:IndexFaces",
                   "rekognition:DeleteCollection",
                   "rekognition:DeleteFaces"
               ],
               "Resource": "*"
           }
       ]
   }
   ```

3. Save your credentials:
   - After creating the user, you'll receive an Access Key ID and Secret Access Key
   - Keep these secure and never commit them to version control
   - Enter them in the application's credentials section

## Security Notes

- All AWS credentials are processed locally
- Credentials are only stored if "Save credentials" is checked
- If stored, credentials are saved in browser's localStorage
- No data is sent to third parties - all traffic is directly between your browser and AWS
- Regularly rotate your AWS access keys
- Delete unused IAM users and access keys

## Error Handling

The application handles various error scenarios:
- Network connectivity issues
- Invalid AWS credentials
- Missing IAM permissions
- Invalid image formats
- Collection not found errors

## Development

To modify or extend the application:
1. Backend code is in `app.py`
2. Frontend code is in the `static` directory
3. Styles are in `static/styles.css`
4. JavaScript is in `static/app.js`
aws-rekognition-gui - a basic app to crud entities from aws-recognition
